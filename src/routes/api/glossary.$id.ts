import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx } from "@/lib/org-api";

export const Route = createFileRoute("/api/glossary/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_glossaries").delete().eq("id", params.id).select("id");
        if (!data?.length) return jerr("Not found", 404);
        return Response.json({ ok: true });
      },
    },
  },
});
