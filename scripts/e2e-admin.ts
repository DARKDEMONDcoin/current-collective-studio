// Admin panel rules: role checks, credit adjustments, audit log, linguist payout snapshot.
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


const C = await mk("client", "CLIENT"), L = await mk("ling", "LINGUIST"), AD = await mk("admin", "CLIENT");
await admin.from("ct_user_roles").insert({ user_id: AD.id, role: "ADMIN" });
const as = (t: string) => createClient(URL_, PUB, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${t}` } } });
const c = as(C.tok), ad = as(AD.tok);
const orgC = await orgOf(C.id);
const { data: rates0 } = await admin.from("ct_linguist_rates").select("*").eq("workflow_type", "AI_HUMAN").single();
let pid = "";
try {
  // Role checks
  ok("client is not admin", !(await c.rpc("ct_has_role", { _user_id: C.id, _role: "ADMIN" })).data);
  ok("admin is admin", !!(await ad.rpc("ct_has_role", { _user_id: AD.id, _role: "ADMIN" })).data);
  ok("client cannot call credit adjust", !!(await c.rpc("ct_admin_adjust_credits" as any, { _admin: C.id, _org: orgC, _amount: 999, _reason: "x" })).error);
  ok("client cannot self-grant admin", !!(await c.from("ct_user_roles").insert({ user_id: C.id, role: "ADMIN" })).error || !(await admin.from("ct_user_roles").select("id").eq("user_id", C.id).eq("role", "ADMIN")).data?.length);
  ok("client sees no audit rows", ((await c.from("ct_admin_audit" as any).select("id")).data ?? []).length === 0);
  ok("client cannot edit linguist rates", ((await c.from("ct_linguist_rates" as any).update({ rate_per_word: 9 }).eq("workflow_type", "AI_HUMAN").select()).data ?? []).length === 0);
  const prof = await ad.from("ct_profiles").select("user_id", { count: "exact", head: true });
  ok("admin can read all profiles", (prof.count ?? 0) >= 3, String(prof.count));

  // Admin settings: only admins write; the server enforces them
  const cw = await c.from("ct_admin_settings" as any).upsert({ key: "general", value: { ordersPaused: true } }).select();
  ok("client cannot change platform settings", !!cw.error || !(cw.data ?? []).length);
  ok("client cannot read AI usage", ((await c.from("ct_ai_usage" as any).select("id").limit(1)).data ?? []).length === 0);
  const { data: prevGeneral } = await admin.from("ct_admin_settings" as any).select("value").eq("key", "general").maybeSingle();
  const aw = await ad.from("ct_admin_settings" as any).upsert({ key: "general", value: { ordersPaused: true, pauseMessage: "QA pause" } }).select();
  ok("admin can change platform settings", !aw.error && (aw.data ?? []).length === 1, aw.error?.message);
  await new Promise((r) => setTimeout(r, 31_000)); // server caches settings for 30s
  const paused = await api(C.tok)("/api/projects", { method: "POST", body: JSON.stringify({ name: "x", targetLanguages: ["Arabic"], segments: ["Hello"], wordCount: 1, workflowType: "CREDITS", idempotencyKey: crypto.randomUUID() }) });
  ok("paused orders are refused with the admin message", paused.s === 503 && paused.j?.error === "QA pause", `${paused.s} ${JSON.stringify(paused.j)}`);
  if (prevGeneral) await admin.from("ct_admin_settings" as any).update({ value: (prevGeneral as any).value }).eq("key", "general");
  else await admin.from("ct_admin_settings" as any).delete().eq("key", "general");
  await new Promise((r) => setTimeout(r, 31_000)); // let the server pick up the restored setting

  // Credit adjustment
  const b0 = await balance(orgC);
  let r: any = await admin.rpc("ct_admin_adjust_credits" as any, { _admin: C.id, _org: orgC, _amount: 500, _reason: "fake" });
  ok("non-admin id rejected by DB", !!r.error);
  r = await admin.rpc("ct_admin_adjust_credits" as any, { _admin: AD.id, _org: orgC, _amount: 500, _reason: "QA goodwill" });
  ok("admin adds 500 credits", r.data?.balance === b0 + 500 && (await balance(orgC)) === b0 + 500, JSON.stringify(r));
  const tx = (await admin.from("ct_credit_transactions").select("type,amount,description").eq("organization_id", orgC).eq("type", "ADMIN_ADJUSTMENT")).data ?? [];
  ok("transaction recorded with reason", tx.length === 1 && tx[0].amount === 500 && tx[0].description === "QA goodwill");
  r = await admin.rpc("ct_admin_adjust_credits" as any, { _admin: AD.id, _org: orgC, _amount: -(b0 + 501), _reason: "too much" });
  ok("cannot push balance below zero", r.data?.error === "NOT_FOUND_OR_NEGATIVE" && (await balance(orgC)) === b0 + 500);
  r = await admin.rpc("ct_admin_adjust_credits" as any, { _admin: AD.id, _org: orgC, _amount: 10, _reason: "  " });
  ok("reason required", !!r.error);
  const au = (await ad.from("ct_admin_audit" as any).select("action,target").eq("admin_id", AD.id)).data ?? [];
  ok("admin sees audit row", au.some((a: any) => a.action === "credits.adjust" && a.target === orgC));

  // Roles
  r = await admin.rpc("ct_admin_set_role" as any, { _admin: AD.id, _user: AD.id, _role: "ADMIN", _grant: false });
  ok("admin cannot remove own admin", !!r.error);
  r = await admin.rpc("ct_admin_set_role" as any, { _admin: AD.id, _user: C.id, _role: "LINGUIST", _grant: true });
  ok("admin grants linguist", !r.error && !!(await admin.from("ct_user_roles").select("id").eq("user_id", C.id).eq("role", "LINGUIST")).data?.length);
  await admin.rpc("ct_admin_set_role" as any, { _admin: AD.id, _user: C.id, _role: "LINGUIST", _grant: false });
  ok("admin revokes linguist", !(await admin.from("ct_user_roles").select("id").eq("user_id", C.id).eq("role", "LINGUIST")).data?.length);

  // Payout snapshot at acceptance
  await admin.from("ct_linguist_rates" as any).update({ rate_per_word: 0.05, min_payout: 2 }).eq("workflow_type", "AI_HUMAN");
  const segs = Array.from({ length: 10 }, (_, i) => ({ text: `This is sentence number ${i + 1} of the agreement between the two parties.`, formatHint: "p" }));
  const words = segs.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  const o = await api(C.tok)("/api/projects", { method: "POST", body: JSON.stringify({ name: "QA payout", sourceLanguage: "English", targetLanguages: ["Arabic"], workflowType: "AI_HUMAN", wordCount: words, segments: segs, idempotencyKey: crypto.randomUUID() }) });
  pid = o.j?.id;
  ok("order for payout created", o.s === 201, JSON.stringify(o.j)?.slice(0, 200));
  const job = (await admin.from("ct_jobs").select("id,word_count").eq("project_id", pid).single()).data!;
  const acc = await api(L.tok)(`/api/jobs/${job.id}/accept`, { method: "POST" });
  const pay = Number((await admin.from("ct_jobs").select("payout_amount").eq("id", job.id).single()).data!.payout_amount);
  const expect = Math.max(Math.round(job.word_count * 0.05 * 100) / 100, 2);
  ok("payout = words x rate (min applied)", acc.s === 200 && pay === expect, `accept ${acc.s}, words ${job.word_count}, pay ${pay}, expected ${expect}`);
  await admin.from("ct_linguist_rates" as any).update({ rate_per_word: 1 }).eq("workflow_type", "AI_HUMAN");
  ok("later rate change does not alter agreed pay", Number((await admin.from("ct_jobs").select("payout_amount").eq("id", job.id).single()).data!.payout_amount) === expect);
} finally {
  await admin.from("ct_linguist_rates" as any).update({ rate_per_word: rates0?.rate_per_word ?? 0, min_payout: rates0?.min_payout ?? 0 }).eq("workflow_type", "AI_HUMAN");
  if (pid) await admin.from("ct_projects").delete().eq("id", pid);
  await admin.from("ct_admin_audit" as any).delete().eq("admin_id", AD.id);
  for (const u of users) {
    const org = (await admin.from("ct_profiles").select("organization_id").eq("user_id", u.id).maybeSingle()).data?.organization_id;
    await admin.auth.admin.deleteUser(u.id);
    if (org) { await admin.from("ct_credit_transactions").delete().eq("organization_id", org); await admin.from("ct_organizations").delete().eq("id", org); }
  }
  console.log(results.join("\n"));
  console.log(`${results.filter((x) => x.startsWith("PASS")).length}/${results.length} passed`);
}
