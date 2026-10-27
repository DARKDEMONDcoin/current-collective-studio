// Loads an org's departments with members shaped like the original Prisma include.
import type { OrgCtx } from "@/lib/org-api";
import { camel } from "@/lib/ct-shape";

export async function loadDepartments(ctx: OrgCtx, id?: string) {
  let q = ctx.supabase.from("ct_departments").select("*, members:ct_department_members(*)").order("created_at");
  if (id) q = q.eq("id", id);
  const { data } = await q;
  const { data: profs } = await ctx.supabase.from("ct_profiles").select("user_id,name,email").eq("organization_id", ctx.orgId);
  const pm = new Map((profs ?? []).map((p) => [p.user_id, p]));
  const { data: proj } = await ctx.supabase.from("ct_projects").select("client_id");
  const pc: Record<string, number> = {};
  for (const p of proj ?? []) pc[p.client_id] = (pc[p.client_id] ?? 0) + 1;
  return (data ?? []).map((d: any) => ({
    ...camel({ ...d, members: undefined }),
    members: (d.members ?? []).map((m: any) => {
      const p = pm.get(m.user_id);
      return {
        ...camel(m),
        canAccessTM: m.can_access_tm,
        jobCount: pc[m.user_id] ?? 0,
        user: { id: m.user_id, name: p?.name ?? null, email: p?.email ?? "", role: "CLIENT" },
      };
    }),
  }));
}
