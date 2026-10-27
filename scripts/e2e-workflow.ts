// End-to-end: order -> background AI -> Linguist accept/edit/submit -> client changes/approve -> downloads.
// Uses throwaway accounts in the live DB and deletes them afterwards.
// Run: bun scripts/e2e-workflow.ts   (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY; dev server on :8080)
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
const URL_ = process.env.SUPABASE_URL!, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!, PUB = process.env.SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL_, SVC, { auth: { persistSession: false } });
const B = "http://localhost:8080";
const results: string[] = []; const ok = (n: string, c: boolean, extra = "") => results.push(`${c ? "PASS" : "FAIL"} ${n} ${c ? "" : extra}`);
const users: { id: string }[] = [];
async function mk(tag: string, role: "CLIENT" | "LINGUIST") {
  const email = `qa-${tag}-${Date.now()}@example.com`, password = "Qa!" + crypto.randomUUID();
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "QA " + tag, ct_role: role, ct_org_name: "QA Org " + tag } });
  if (error) throw error;
  users.push({ id: u.user!.id });
  await new Promise((r) => setTimeout(r, 800));
  if (role === "LINGUIST") {
    const { data: r } = await admin.from("ct_user_roles").select("role").eq("user_id", u.user!.id);
    if (!(r ?? []).some((x) => x.role === "LINGUIST")) await admin.from("ct_user_roles").insert({ user_id: u.user!.id, role: "LINGUIST" });
  }
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password });
  return { id: u.user!.id, tok: s.session!.access_token };
}
const api = (t: string) => async (path: string, init: RequestInit = {}) => {
  const h = new Headers(init.headers); h.set("Authorization", `Bearer ${t}`);
  if (init.body && typeof init.body === "string") h.set("Content-Type", "application/json");
  const r = await fetch(B + path, { ...init, headers: h });
  const buf = new Uint8Array(await r.arrayBuffer()); let j: any = null; try { j = JSON.parse(new TextDecoder().decode(buf)); } catch {}
  return { s: r.status, j, buf, type: r.headers.get("content-type") ?? "" };
};
const orgOf = async (uid: string) => (await admin.from("ct_profiles").select("organization_id").eq("user_id", uid).single()).data!.organization_id as string;
const balance = async (org: string) => (await admin.from("ct_organizations").select("credit_balance").eq("id", org).single()).data!.credit_balance as number;

const A = await mk("client-a", "CLIENT"), Bc = await mk("client-b", "CLIENT"), L = await mk("ling-1", "LINGUIST"), L2 = await mk("ling-2", "LINGUIST");
const projects: string[] = [];
try {
  const a = api(A.tok), b = api(Bc.tok), l = api(L.tok), l2 = api(L2.tok);
  const orgA = await orgOf(A.id);
  const bal0 = await balance(orgA);

  // 1. Upload a Word file
  const fd = new FormData(); fd.append("file", new File([readFileSync("scripts/fixtures/sample.docx")], "report.docx"));
  let r = await a("/api/upload/analyze", { method: "POST", body: fd });
  ok("analyze docx keeps original", r.s === 200 && r.j.docxStoredPath?.startsWith(orgA + "/"), JSON.stringify(r.j)?.slice(0, 200));
  const an = r.j;

  // 2. AI + Human order, twice with the same key
  const key = crypto.randomUUID();
  const order = { name: "QA AI+Human", sourceLanguage: "English", targetLanguages: ["Arabic"], workflowType: "AI_HUMAN", wordCount: an.wordCount, segments: an.segments, filename: an.filename, docxStoredPath: an.docxStoredPath, idempotencyKey: key };
  r = await a("/api/projects", { method: "POST", body: JSON.stringify(order) });
  ok("order created", r.s === 201, JSON.stringify(r.j)?.slice(0, 200));
  const pid = r.j?.id; projects.push(pid);
  ok("AI draft done -> project IN_PROGRESS (not completed)", r.j?.status === "IN_PROGRESS", r.j?.status);
  const bal1 = await balance(orgA);
  r = await a("/api/projects", { method: "POST", body: JSON.stringify(order) });
  ok("duplicate submit returns same project", r.j?.id === pid);
  ok("charged exactly once", bal0 - bal1 > 0 && (await balance(orgA)) === bal1, `${bal0}->${bal1}`);
  r = await b(`/api/projects/${pid}/progress`); ok("other org cannot see progress", r.s === 404);

  const jobId = (await admin.from("ct_jobs").select("id").eq("project_id", pid).single()).data!.id;
  r = await a(`/api/jobs/${jobId}/deliver?format=docx`); ok("client cannot download before approval", r.s === 409);

  // 3. Linguist flow
  r = await l("/api/jobs/" + jobId); ok("linguist sees open job", r.s === 200 && r.j.status === "AVAILABLE", JSON.stringify(r.j));
  r = await b("/api/jobs/" + jobId); ok("other client cannot see job", r.s === 404);
  r = await a(`/api/jobs/${jobId}/accept`, { method: "POST" }); ok("client cannot accept jobs", r.s === 403);
  r = await l(`/api/jobs/${jobId}/accept`, { method: "POST" }); ok("linguist accepts", r.s === 200);
  r = await l2(`/api/jobs/${jobId}/accept`, { method: "POST" }); ok("second linguist cannot accept", r.s === 409);
  r = await l2(`/api/jobs/${jobId}/segments`); ok("other linguist cannot read segments", r.s === 404);
  r = await l(`/api/jobs/${jobId}/segments`);
  const segs = r.j?.segments ?? [];
  ok("segments have AI draft", segs.length > 0 && segs.every((s: any) => s.translatedText), JSON.stringify(segs).slice(0, 200));
  r = await l2(`/api/segments/${segs[0].id}`, { method: "PATCH", body: JSON.stringify({ jobId, translatedText: "hack" }) }); ok("other linguist cannot edit", r.s === 403);
  r = await l(`/api/segments/${segs[0].id}`, { method: "PATCH", body: JSON.stringify({ jobId, translatedText: "" }) }); ok("linguist saves segment", r.s === 200);
  r = await l(`/api/jobs/${jobId}/submit`, { method: "POST" }); ok("cannot submit with empty segment", r.s === 409);
  r = await l(`/api/segments/${segs[0].id}`, { method: "PATCH", body: JSON.stringify({ jobId, translatedText: "التقرير السنوي (مراجع)", status: "REVIEWED" }) });
  r = await l(`/api/jobs/${jobId}/submit`, { method: "POST" }); ok("linguist submits", r.s === 200 && r.j.status === "SUBMITTED", JSON.stringify(r.j));
  r = await l(`/api/jobs/${jobId}/submit`, { method: "POST" }); ok("double submit rejected", r.s === 409);
  let proj = (await admin.from("ct_projects").select("status").eq("id", pid).single()).data!;
  ok("project not completed before client approval", proj.status === "IN_PROGRESS", proj.status);

  // 4. Client review
  r = await b(`/api/jobs/${jobId}/approve`, { method: "POST" }); ok("other org cannot approve", r.s === 404);
  r = await a(`/api/jobs/${jobId}/request-changes`, { method: "POST", body: JSON.stringify({ note: "Please use formal tone" }) }); ok("client requests changes", r.s === 200);
  r = await l(`/api/jobs/${jobId}/submit`, { method: "POST" }); ok("linguist resubmits", r.s === 200);
  r = await a(`/api/jobs/${jobId}/approve`, { method: "POST" }); ok("client approves", r.s === 200 && r.j.projectStatus === "COMPLETED", JSON.stringify(r.j));
  r = await a(`/api/jobs/${jobId}/approve`, { method: "POST" }); ok("double approve rejected", r.s === 409);

  // 5. Downloads
  r = await a(`/api/jobs/${jobId}/deliver?format=docx`); ok("docx download (original layout)", r.s === 200 && r.buf[0] === 0x50 && r.buf[1] === 0x4b); writeFileSync("/tmp/e2e-out.docx", r.buf);
  r = await a(`/api/jobs/${jobId}/deliver?format=pdf`); ok("pdf download is a real PDF", r.s === 200 && new TextDecoder().decode(r.buf.slice(0, 5)) === "%PDF-"); writeFileSync("/tmp/e2e-out.pdf", r.buf);
  r = await a(`/api/jobs/${jobId}/deliver?format=pptx`); ok("pptx refused for a Word source", r.s === 400);
  r = await b(`/api/jobs/${jobId}/deliver?format=docx`); ok("other org cannot download", r.s === 404);

  // 6. PowerPoint order (AI only)
  const pf = new FormData(); pf.append("file", new File([readFileSync("scripts/fixtures/sample.pptx")], "deck.pptx"));
  r = await a("/api/upload/analyze", { method: "POST", body: pf }); const pan = r.j;
  ok("analyze pptx", r.s === 200 && pan.pptxStoredPath && pan.segments.length === 3, JSON.stringify(r.j)?.slice(0, 200));
  r = await a("/api/projects", { method: "POST", body: JSON.stringify({ name: "QA deck", sourceLanguage: "English", targetLanguages: ["French"], workflowType: "CREDITS", wordCount: pan.wordCount, segments: pan.segments, filename: pan.filename, pptxStoredPath: pan.pptxStoredPath, idempotencyKey: crypto.randomUUID() }) });
  projects.push(r.j?.id);
  ok("AI-only order completes", r.s === 201 && r.j.status === "COMPLETED", JSON.stringify(r.j)?.slice(0, 200));
  const pj = (await admin.from("ct_jobs").select("id").eq("project_id", r.j.id).single()).data!.id;
  r = await a(`/api/jobs/${pj}/deliver?format=pptx`); ok("pptx download", r.s === 200 && r.buf[0] === 0x50); writeFileSync("/tmp/e2e-out.pptx", r.buf);
  r = await l(`/api/jobs/${pj}`); ok("AI-only jobs never appear to linguists", r.s === 404);

  // 7. Background processing: big order resumes across steps, single worker at a time
  const big = Array.from({ length: 130 }, (_, i) => ({ text: `This is sentence number ${i + 1} of a long contract.`, formatHint: "p" }));
  const { data: cr } = await admin.rpc("ct_create_project_once", { _user: A.id, _org: orgA, p: { name: "QA big", sourceLanguage: "English", targetLanguages: ["Spanish"], workflowType: "CREDITS", wordCount: 1300, segments: big, filename: "big.txt", idempotencyKey: crypto.randomUUID() } });
  const bid = (cr as any).id; projects.push(bid);
  const { processProject } = await import("../src/lib/order-pipeline.server");
  const [s1, s2] = await Promise.all([processProject(bid, 1500), processProject(bid, 1500)]);
  ok("only one worker processes at a time", [s1, s2].filter((x) => x.done > 0 && x.done < 130).length <= 1 && (s1.status === "PROCESSING" || s2.status === "PROCESSING"), JSON.stringify([s1, s2]));
  const mid = (await admin.from("ct_projects").select("status,progress_done,progress_total").eq("id", bid).single()).data!;
  ok("partial progress saved", mid.status === "PROCESSING" && mid.progress_done > 0 && mid.progress_done < 130 && mid.progress_total === 130, JSON.stringify(mid));
  r = await a(`/api/projects/${bid}/progress`); ok("progress endpoint", r.s === 200 && r.j.total === 130, JSON.stringify(r.j));
  let last: any = null;
  for (let i = 0; i < 10; i++) { last = await processProject(bid, 25000); if (last.status !== "PROCESSING") break; }
  const { count } = await admin.from("ct_segment_translations").select("id", { count: "exact", head: true }).eq("job_id", (await admin.from("ct_jobs").select("id").eq("project_id", bid).single()).data!.id);
  ok("big order completes with each segment translated once", last.status === "COMPLETED" && count === 130, `${JSON.stringify(last)} count=${count}`);

  // 8. Scheduler endpoint
  const res = await fetch(B + "/api/public/process-orders", { method: "POST" }); ok("scheduler endpoint rejects missing secret", res.status === 401);
  const { data: sec } = await admin.from("ct_internal_secrets").select("value").eq("key", "cron_secret").single();
  const res2 = await fetch(B + "/api/public/process-orders", { method: "POST", headers: { "x-cron-secret": sec!.value } }); ok("scheduler endpoint accepts secret", res2.status === 200);
  const ua = createClient(URL_, PUB, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${A.tok}` } } });
  const { data: leak } = await ua.from("ct_internal_secrets").select("value"); ok("users cannot read the scheduler secret", !leak?.length);

  // 9. Failure -> refund exactly once
  const { data: fr } = await admin.rpc("ct_create_project_once", { _user: A.id, _org: orgA, p: { name: "QA fail", sourceLanguage: "English", targetLanguages: ["German"], workflowType: "CREDITS", wordCount: 50, segments: [{ text: "Hello world", formatHint: "p" }], filename: "f.txt", idempotencyKey: crypto.randomUUID() } });
  const fid = (fr as any).id; projects.push(fid);
  const before = await balance(orgA);
  await admin.from("ct_projects").update({ attempts: 2 }).eq("id", fid);
  await admin.from("ct_projects").update({ source_language: "" }).eq("id", fid);
  const { data: r1 } = await admin.rpc("ct_refund_project", { _project: fid, _reason: "qa" });
  const { data: r2 } = await admin.rpc("ct_refund_project", { _project: fid, _reason: "qa again" });
  ok("refund once", (r1 as number) > 0 && r2 === 0 && (await balance(orgA)) === before + (r1 as number), `${r1} ${r2}`);
} finally {
  for (const pid of projects.filter(Boolean)) {
    const { data: docs } = await admin.from("ct_documents").select("id,original_file_url").eq("project_id", pid);
    const { data: jobs } = await admin.from("ct_jobs").select("id").eq("project_id", pid);
    for (const j of jobs ?? []) await admin.from("ct_segment_translations").delete().eq("job_id", j.id);
    for (const d of docs ?? []) { await admin.from("ct_segments").delete().eq("document_id", d.id); if (d.original_file_url && d.original_file_url !== "#") await admin.storage.from("ct-originals").remove([d.original_file_url]); }
    await admin.from("ct_documents").delete().eq("project_id", pid);
    await admin.from("ct_jobs").delete().eq("project_id", pid);
    await admin.from("ct_credit_transactions").delete().eq("related_project_id", pid);
    await admin.from("ct_projects").delete().eq("id", pid);
  }
  for (const u of users) {
    const { data: p } = await admin.from("ct_profiles").select("organization_id").eq("user_id", u.id).maybeSingle();
    if (p?.organization_id) {
      const { data: files } = await admin.storage.from("ct-originals").list(p.organization_id, { limit: 100 });
      for (const f of files ?? []) {
        const { data: inner } = await admin.storage.from("ct-originals").list(`${p.organization_id}/${f.name}`);
        await admin.storage.from("ct-originals").remove((inner ?? []).map((x) => `${p.organization_id}/${f.name}/${x.name}`));
      }
      for (const t of ["ct_credit_transactions", "ct_ocr_requests"]) await admin.from(t).delete().eq("organization_id", p.organization_id);
    }
    await admin.from("ct_in_app_notifications").delete().eq("user_id", u.id);
    await admin.from("ct_user_roles").delete().eq("user_id", u.id);
    await admin.from("ct_profiles").delete().eq("user_id", u.id);
    if (p?.organization_id) await admin.from("ct_organizations").delete().eq("id", p.organization_id);
    await admin.auth.admin.deleteUser(u.id);
  }
  console.log(results.join("\n"));
}
