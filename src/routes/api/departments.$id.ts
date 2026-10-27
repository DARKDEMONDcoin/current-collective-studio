import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx, short } from "@/lib/org-api";

export const Route = createFileRoute("/api/departments/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const d: any = {};
        if (b.name !== undefined) { const n = short(b.name, 100); if (!n) return jerr("Invalid input"); d.name = n; }
        if (b.description !== undefined) d.description = short(b.description, 500);
        const { data } = await ctx.supabase.from("ct_departments").update(d).eq("id", params.id).select().maybeSingle();
        if (!data) return jerr("Not found", 404);
        return Response.json(camel(data));
      },
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_departments").delete().eq("id", params.id).select("id");
        if (!data?.length) return jerr("Not found", 404);
        return Response.json({ success: true });
      },
    },
  },
});
