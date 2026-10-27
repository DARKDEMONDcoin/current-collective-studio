import { createClient } from "@supabase/supabase-js";
const URL_ = process.env.SUPABASE_URL!, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!, PUB = process.env.SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL_, SVC, { auth: { persistSession: false } });
const B = "http://localhost:8080";
const results: string[] = []; const ok = (n: string, c: boolean, extra = "") => results.push(`${c ? "PASS" : "FAIL"} ${n} ${extra}`);
async function mk(tag: string) {
  const email = `qa-${tag}-${Date.now()}@example.com`, password = "Qa!" + crypto.randomUUID();
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "QA " + tag, ct_role: "CLIENT", ct_org_name: "QA Org " + tag } });
  if (error) throw error;
  const c = createClient(URL_, PUB, { auth: { persistSession: false } });
  const { data: s } = await c.auth.signInWithPassword({ email, password });
  return { id: u.user!.id, tok: s.session!.access_token };
}
const api = (t: string) => async (path: string, init: RequestInit = {}) => {
  const h = new Headers(init.headers); h.set("Authorization", `Bearer ${t}`);
  if (init.body && typeof init.body === "string") h.set("Content-Type", "application/json");
  const r = await fetch(B + path, { ...init, headers: h }); let j: any = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
};
const A = await mk("a"), Bu = await mk("b");
try {
  await new Promise((r) => setTimeout(r, 1500));
  const a = api(A.tok), b = api(Bu.tok);
  let r = await a("/api/client-accounts", { method: "POST", body: JSON.stringify({ name: "Acme", industry: "Legal" }) }); ok("create client", r.s === 201, JSON.stringify(r.j)?.slice(0, 80)); const cid = r.j?.id;
  r = await a("/api/client-accounts"); ok("list clients", r.s === 200 && r.j.length === 1);
  r = await b("/api/client-accounts"); ok("other org cannot see client", r.s === 200 && r.j.length === 0);
  r = await b(`/api/client-accounts/${cid}`, { method: "DELETE" }); ok("other org cannot delete client", r.s === 404);
  r = await a("/api/tm", { method: "POST", body: JSON.stringify({ name: "TM1", sourceLanguage: "English", targetLanguage: "Arabic", clientAccountId: cid }) }); ok("create TM", r.s === 201); const tmid = r.j?.id;
  const fd = new FormData(); fd.append("file", new File(["source,target\nHello,مرحبا\nThank you,شكرا\n"], "tm.csv"));
  r = await a(`/api/tm/${tmid}/import`, { method: "POST", body: fd }); ok("import TM csv", r.s === 200 && r.j.imported === 2, JSON.stringify(r.j));
  r = await a("/api/tm"); ok("TM entry count", r.j?.[0]?.entryCount === 2);
  r = await b(`/api/tm/${tmid}`); ok("other org cannot read TM", r.s === 404);
  r = await a("/api/glossary", { method: "POST", body: JSON.stringify({ name: "G1", languages: ["Arabic"] }) }); ok("create glossary", r.s === 201); const gid = r.j?.id;
  r = await a(`/api/glossary/${gid}/terms`, { method: "POST", body: JSON.stringify({ term: "Contentech", doNotTranslate: true }) }); ok("add DNT term", r.s === 201);
  r = await a("/api/glossary"); ok("glossary has term", r.j?.[0]?.terms?.length === 1 && r.j[0].termCount === 1);
  const sfd = new FormData(); sfd.append("name", "Brand voice"); sfd.append("content", "Be concise.");
  r = await a("/api/style-guides", { method: "POST", body: sfd }); ok("create style guide", r.s === 201);
  r = await b("/api/style-guides"); ok("other org sees no style guides", r.j?.length === 0);
  r = await a("/api/departments", { method: "POST", body: JSON.stringify({ name: "Marketing" }) }); ok("create team", r.s === 201); const did = r.j?.id;
  r = await a(`/api/departments/${did}/members`, { method: "POST", body: JSON.stringify({ userId: A.id, canAccessTM: true }) }); ok("add self to team", r.s === 201);
  r = await a(`/api/departments/${did}/members`, { method: "POST", body: JSON.stringify({ userId: Bu.id }) }); ok("cannot add other org user", r.s === 404);
  r = await a("/api/developer/keys", { method: "POST", body: JSON.stringify({ name: "CI" }) }); ok("create API key (shown once)", r.s === 201 && r.j.key?.startsWith("ctk_live_"));
  r = await a("/api/developer/keys"); ok("key list hides secret", r.j?.length === 1 && !("key" in r.j[0]) && !("keyHash" in r.j[0]));
  r = await a("/api/developer/webhooks", { method: "POST", body: JSON.stringify({ url: "https://example.com/hook" }) }); ok("create webhook", r.s === 201 && r.j.secret);
  r = await a("/api/organization/linguists"); ok("linguists list", r.s === 200 && Array.isArray(r.j.pool), `pool=${r.j?.pool?.length}`);
  const lid = r.j?.pool?.[0]?.id;
  if (lid) {
    r = await a(`/api/linguists/${lid}/favorite`, { method: "POST" }); ok("favourite linguist", r.j?.favorited === true);
    r = await a(`/api/linguists/${lid}/blacklist`, { method: "POST", body: JSON.stringify({ reason: "test" }) }); ok("block linguist removes favourite", r.j?.blacklisted === true);
    r = await a(`/api/linguists/${lid}/favorite`); ok("favourite cleared after block", r.j?.favorited === false);
    await a(`/api/linguists/${lid}/blacklist`, { method: "POST" });
  } else results.push("SKIP favourite/block (no linguists in pool)");
  r = await a("/api/notifications?page=1&limit=25"); ok("notifications paging", r.s === 200 && typeof r.j.total === "number");
  // OCR billing: tiny PNG with text is hard to make; use a 1-page text-less PDF to force scan path rejection
  const ofd = new FormData(); ofd.append("file", new File(["hello world"], "note.txt"));
  r = await a("/api/ocr-requests", { method: "POST", body: ofd }); ok("OCR rejects non-scanned file", r.s === 415);
  const { data: before } = await admin.from("ct_profiles").select("organization_id").eq("user_id", A.id).single();
  const { data: org } = await admin.from("ct_organizations").select("credit_balance").eq("id", before!.organization_id).single();
  const { data: ch } = await admin.rpc("ct_charge_ocr", { _user: A.id, _org: before!.organization_id, p: { pageCount: 3, filename: "scan.pdf", idempotencyKey: "k1", extractedText: "x" } });
  const { data: ch2 } = await admin.rpc("ct_charge_ocr", { _user: A.id, _org: before!.organization_id, p: { pageCount: 3, filename: "scan.pdf", idempotencyKey: "k1" } });
  const { data: org2 } = await admin.from("ct_organizations").select("credit_balance").eq("id", before!.organization_id).single();
  ok("OCR charges 5 credits/page once", (ch as any)?.charged === 15 && (ch2 as any)?.duplicate === true && org!.credit_balance - org2!.credit_balance === 15, `${org!.credit_balance}->${org2!.credit_balance}`);
  r = await a("/api/ocr-requests"); ok("OCR request listed", r.j?.length === 1 && r.j[0].creditsCharged === 15);
  r = await b("/api/ocr-requests"); ok("other org sees no OCR requests", r.j?.length === 0);
  // test entitlement must not apply to ordinary users
  const { data: t } = await admin.rpc("ct_is_test_user", { _user: A.id }); ok("normal user is not a test user", t === false);
  const ua = createClient(URL_, PUB, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${A.tok}` } } });
  const { error: insErr } = await ua.from("ct_test_entitlements").insert({ user_id: A.id }); ok("user cannot self-grant test access", !!insErr);
  const { error: oErr } = await ua.from("ct_ocr_requests").insert({ organization_id: before!.organization_id, created_by_id: A.id, source_filename: "x" }); ok("user cannot create unbilled OCR rows", !!oErr);
  const { error: kErr } = await ua.from("ct_api_keys").insert({ organization_id: before!.organization_id, name: "x", key_prefix: "x", key_hash: "x" }); ok("user cannot insert raw API keys", !!kErr);
} finally {
  for (const u of [A, Bu]) {
    const { data: p } = await admin.from("ct_profiles").select("organization_id").eq("user_id", u.id).maybeSingle();
    if (p?.organization_id) {
      for (const t of ["ct_credit_transactions", "ct_ocr_requests", "ct_api_keys", "ct_webhook_subscriptions", "ct_linguist_blacklist", "ct_department_members", "ct_departments", "ct_tm_entries", "ct_translation_memories", "ct_glossary_terms", "ct_glossaries", "ct_style_guides", "ct_client_accounts", "ct_favorite_linguists"])
        await admin.from(t).delete().eq("organization_id", p.organization_id);
    }
    await admin.from("ct_user_roles").delete().eq("user_id", u.id);
    await admin.from("ct_profiles").delete().eq("user_id", u.id);
    if (p?.organization_id) await admin.from("ct_organizations").delete().eq("id", p.organization_id);
    await admin.auth.admin.deleteUser(u.id);
  }
  console.log(results.join("\n"));
}
