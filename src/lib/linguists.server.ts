// Builds linguist cards for the client portal from ct_user_roles + ct_profiles.
// Ratings and completed-job counts are platform-wide aggregates (no private data).
export async function linguistCards(ids?: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let rq = supabaseAdmin.from("ct_user_roles").select("user_id").eq("role", "LINGUIST");
  if (ids) rq = rq.in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data: roles } = await rq.limit(200);
  const uids = (roles ?? []).map((r) => r.user_id);
  if (!uids.length) return [];
  const [{ data: profs }, { data: reviews }, { data: jobs }] = await Promise.all([
    supabaseAdmin.from("ct_profiles").select("user_id,name,email,organization_id").in("user_id", uids),
    supabaseAdmin.from("ct_linguist_reviews").select("linguist_id,rating").in("linguist_id", uids),
    supabaseAdmin.from("ct_jobs").select("linguist_id,source_language,target_language,status").in("linguist_id", uids),
  ]);
  return (profs ?? []).map((p) => {
    const rs = (reviews ?? []).filter((r) => r.linguist_id === p.user_id);
    const js = (jobs ?? []).filter((j) => j.linguist_id === p.user_id);
    const pairs = new Map<string, { sourceLang: string; targetLang: string }>();
    for (const j of js) pairs.set(`${j.source_language}>${j.target_language}`, { sourceLang: j.source_language, targetLang: j.target_language });
    return {
      id: p.user_id, name: p.name, email: p.email, orgId: p.organization_id as string | null, isActive: true,
      languagePairs: [...pairs.values()],
      rating: rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : 0,
      reviewCount: rs.length,
      completedJobs: js.filter((j) => j.status === "COMPLETED").length,
      specializations: [] as string[],
    };
  });
}
