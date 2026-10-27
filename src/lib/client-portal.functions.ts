import { createServerFn } from "@tanstack/react-start";
import { notFound } from "@tanstack/react-router";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { camel } from "@/lib/ct-shape";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function orgAndRole(sb: any, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    sb.from("ct_profiles").select("organization_id").eq("user_id", userId).maybeSingle(),
    sb.from("ct_user_roles").select("role").eq("user_id", userId),
  ]);
  const rs = (roles ?? []).map((r: any) => r.role as string);
  const role = rs.includes("ADMIN") ? "ADMIN" : rs.includes("LINGUIST") ? "LINGUIST" : "CLIENT";
  return { orgId: (profile?.organization_id as string | null) ?? null, role };
}

async function profileNames(ids: string[]) {
  if (ids.length === 0) return new Map<string, any>();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("ct_profiles")
    .select("user_id,name,email,created_at")
    .in("user_id", ids);
  return new Map((data ?? []).map((p) => [p.user_id, p]));
}

export const getProjectDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input.id) }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { orgId } = await orgAndRole(sb, context.userId);
    if (!orgId) throw notFound();
    const [{ data: project }, { data: txs }, { data: favs }] = await Promise.all([
      sb
        .from("ct_projects")
        .select("*, documents:ct_documents(*, segments:ct_segments(status)), jobs:ct_jobs(*, reviews:ct_linguist_reviews(rating,comment))")
        .eq("id", data.id)
        .eq("organization_id", orgId)
        .maybeSingle(),
      sb
        .from("ct_credit_transactions")
        .select("*")
        .eq("related_project_id", data.id)
        .eq("organization_id", orgId),
      sb.from("ct_favorite_linguists").select("linguist_id").eq("customer_id", context.userId),
    ]);
    if (!project) throw notFound();
    // Project ownership verified above; Linguist names are outside the org's read scope.
    const names = await profileNames(
      (project.jobs ?? []).map((j: any) => j.linguist_id).filter(Boolean),
    );
    const shaped = {
      ...project,
      attached_ocr_request: null,
      jobs: (project.jobs ?? []).map((j: any) => ({
        ...j,
        reviews: undefined,
        review: j.reviews?.[0] ?? null,
        linguist: j.linguist_id
          ? { id: j.linguist_id, name: names.get(j.linguist_id)?.name ?? null, email: names.get(j.linguist_id)?.email ?? null }
          : null,
      })),
    };
    return {
      project: camel<any>(shaped),
      creditTxs: camel<any[]>(txs ?? []),
      favoriteIds: (favs ?? []).map((f: any) => f.linguist_id as string),
      blacklistIds: [] as string[],
    };
  });

export const getOrganizationGeneral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { orgId, role } = await orgAndRole(sb, context.userId);
    if (!orgId) return { org: null, userRole: role };
    const [{ data: org }, members, projects] = await Promise.all([
      sb.from("ct_organizations").select("*").eq("id", orgId).maybeSingle(),
      sb.from("ct_profiles").select("user_id", { count: "exact", head: true }).eq("organization_id", orgId),
      sb.from("ct_projects").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    ]);
    if (!org) return { org: null, userRole: role };
    return {
      org: {
        ...camel<any>(org),
        _count: { users: members.count ?? 0, projects: projects.count ?? 0, departments: 0 },
      },
      userRole: role,
    };
  });

export const getTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { orgId } = await orgAndRole(sb, context.userId);
    if (!orgId) return { favorites: [], joinRequests: [] };
    const [{ data: favs }, { data: reqs }] = await Promise.all([
      sb.from("ct_favorite_linguists").select("*").eq("customer_id", context.userId),
      sb
        .from("ct_join_requests")
        .select("*")
        .eq("organization_id", orgId)
        .eq("status", "PENDING")
        .order("created_at", { ascending: false }),
    ]);
    const names = await profileNames([
      ...(favs ?? []).map((f: any) => f.linguist_id),
      ...(reqs ?? []).map((r: any) => r.user_id),
    ]);
    return {
      favorites: (favs ?? []).map((f: any) => ({
        notes: f.notes,
        linguist: { id: f.linguist_id, name: names.get(f.linguist_id)?.name ?? null, linguistProfile: null },
      })),
      joinRequests: (reqs ?? []).map((r: any) => {
        const p = names.get(r.user_id);
        return {
          id: r.id,
          message: r.message,
          createdAt: r.created_at,
          user: { id: r.user_id, name: p?.name ?? null, email: p?.email ?? null, createdAt: p?.created_at ?? r.created_at },
        };
      }),
    };
  });
