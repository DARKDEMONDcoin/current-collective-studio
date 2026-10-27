import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx, short } from "@/lib/org-api";
import { loadDepartments } from "@/lib/departments.server";

export const Route = createFileRoute("/api/departments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        return Response.json(await loadDepartments(ctx));
      },
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const name = short(b.name, 100);
        if (!name) return jerr("Invalid input");
        const { data, error } = await ctx.supabase.from("ct_departments")
          .insert({ organization_id: ctx.orgId, name, description: short(b.description, 500) }).select().single();
        if (error) return jerr("Could not create team", 500);
        return Response.json({ ...camel(data), members: [] }, { status: 201 });
      },
    },
  },
});
