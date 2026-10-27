import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { camel } from "@/lib/ct-shape";
import { PLATFORM_FEATURES, type PlanSlug } from "@/lib/plan-features";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function loadMe(sb: any, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    sb.from("ct_profiles").select("*").eq("user_id", userId).maybeSingle(),
    sb.from("ct_user_roles").select("role").eq("user_id", userId),
  ]);
  const rs = (roles ?? []).map((r: any) => r.role as string);
  const role = rs.includes("ADMIN") ? "ADMIN" : rs.includes("LINGUIST") ? "LINGUIST" : "CLIENT";
  return {
    id: userId,
    name: profile?.name ?? null,
    email: profile?.email ?? null,
    image: profile?.avatar_url ?? null,
    role,
    organizationId: (profile?.organization_id as string | null) ?? null,
  };
}

// Layout data: signed-in user, org plan and plan feature switches (sidebar).
export const getDashboardShell = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const user = await loadMe(sb, context.userId);
    let orgPlan = "STARTER";
    if (user.organizationId) {
      const { data } = await sb
        .from("ct_organizations")
        .select("plan")
        .eq("id", user.organizationId)
        .maybeSingle();
      orgPlan = data?.plan ?? "STARTER";
    }
    const planSlug = orgPlan.toLowerCase() as PlanSlug;
    const featureFlags: Record<string, boolean> = {};
    for (const f of PLATFORM_FEATURES) featureFlags[f.key] = f.defaults[planSlug] ?? false;
    const { data: rows } = await sb
      .from("ct_plan_features")
      .select("feature,enabled")
      .eq("plan_slug", planSlug);
    for (const r of rows ?? []) featureFlags[r.feature] = r.enabled;
    return { user, orgPlan, featureFlags };
  });

export const getDashboardHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const user = await loadMe(sb, context.userId);
    if (!user.organizationId) return { user, projects: [], recentProjects: [] };
    const [{ data: all }, { data: recent }] = await Promise.all([
      sb.from("ct_projects").select("status").eq("organization_id", user.organizationId),
      sb
        .from("ct_projects")
        .select("*, documents:ct_documents(*)")
        .eq("organization_id", user.organizationId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    const counts: Record<string, number> = {};
    for (const p of all ?? []) counts[p.status] = (counts[p.status] ?? 0) + 1;
    return {
      user,
      projects: Object.entries(counts).map(([status, _count]) => ({ status, _count })),
      recentProjects: camel<any[]>(recent ?? []),
    };
  });

export const getProjectsList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const user = await loadMe(sb, context.userId);
    if (!user.organizationId) return [];
    const { data } = await sb
      .from("ct_projects")
      .select("*, documents:ct_documents(*), jobs:ct_jobs(*)")
      .eq("organization_id", user.organizationId)
      .order("created_at", { ascending: false });
    return camel<any[]>((data ?? []).map((p: any) => ({ ...p, attached_ocr_request: null })));
  });

export const getBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const user = await loadMe(sb, context.userId);
    const orgId = user.organizationId;
    const [org, tx, packages, rates] = await Promise.all([
      orgId
        ? sb.from("ct_organizations").select("*").eq("id", orgId).maybeSingle()
        : { data: null },
      orgId
        ? sb
            .from("ct_credit_transactions")
            .select("*, related_project:ct_projects(*)")
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false })
            .limit(15)
        : { data: [] },
      sb.from("ct_credit_packages").select("*").eq("is_active", true).order("display_order"),
      sb.from("ct_credit_rates").select("*"),
    ]);
    return {
      org: camel<any>(org.data),
      transactions: camel<any[]>(tx.data ?? []),
      creditPackages: camel<any[]>(packages.data ?? []),
      creditRates: camel<any[]>(rates.data ?? []),
    };
  });
