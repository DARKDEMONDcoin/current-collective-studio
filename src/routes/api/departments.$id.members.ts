import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx } from "@/lib/org-api";
import { loadDepartments } from "@/lib/departments.server";

export const Route = createFileRoute("/api/departments/$id/members")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const [d] = await loadDepartments(ctx, params.id);
        return Response.json(d?.members ?? []);
      },
      POST: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const userId = String(b.userId ?? "");
        const { data: dept } = await ctx.supabase.from("ct_departments").select("id").eq("id", params.id).maybeSingle();
        if (!dept) return jerr("Department not found", 404);
        const { data: u } = await ctx.supabase.from("ct_profiles").select("user_id").eq("user_id", userId).eq("organization_id", ctx.orgId).maybeSingle();
        if (!u) return jerr("User not found in organization", 404);
        const { error } = await ctx.supabase.from("ct_department_members").upsert({
          department_id: dept.id, organization_id: ctx.orgId, user_id: userId,
          role: b.role === "MANAGER" ? "MANAGER" : "MEMBER",
          can_access_tm: !!b.canAccessTM, can_access_glossary: !!b.canAccessGlossary,
          requires_approval: b.requiresApproval !== false,
        }, { onConflict: "department_id,user_id" });
        if (error) return jerr("Could not add member", 500);
        const [d] = await loadDepartments(ctx, dept.id);
        return Response.json(d.members.find((m: any) => m.userId === userId), { status: 201 });
      },
    },
  },
});
