import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx } from "@/lib/org-api";

export const Route = createFileRoute("/api/tm/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_translation_memories").select("*, entries:ct_tm_entries(*)").eq("id", params.id).maybeSingle();
        if (!data) return jerr("Not found", 404);
        return Response.json(camel(data));
      },
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_translation_memories").delete().eq("id", params.id).select("id");
        if (!data?.length) return jerr("Not found", 404);
        return Response.json({ ok: true });
      },
    },
  },
});
