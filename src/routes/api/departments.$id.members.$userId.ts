import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx } from "@/lib/org-api";
import { loadDepartments } from "@/lib/departments.server";

export const Route = createFileRoute("/api/departments/$id/members/$userId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const d: any = {};
        if (b.role === "MEMBER" || b.role === "MANAGER") d.role = b.role;
        if (typeof b.canAccessTM === "boolean") d.can_access_tm = b.canAccessTM;
        if (typeof b.canAccessGlossary === "boolean") d.can_access_glossary = b.canAccessGlossary;
        if (typeof b.requiresApproval === "boolean") d.requires_approval = b.requiresApproval;
        const { data } = await ctx.supabase.from("ct_department_members").update(d)
          .eq("department_id", params.id).eq("user_id", params.userId).select("id");
        if (!data?.length) return jerr("Not found", 404);
        const [dep] = await loadDepartments(ctx, params.id);
        return Response.json(dep.members.find((m: any) => m.userId === params.userId));
      },
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        await ctx.supabase.from("ct_department_members").delete().eq("department_id", params.id).eq("user_id", params.userId);
        return Response.json({ success: true });
      },
    },
  },
});
