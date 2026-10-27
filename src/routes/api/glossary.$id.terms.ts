import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx, short, type OrgCtx } from "@/lib/org-api";

async function recount(ctx: OrgCtx, id: string) {
  const { count } = await ctx.supabase.from("ct_glossary_terms").select("id", { count: "exact", head: true }).eq("glossary_id", id);
  await ctx.supabase.from("ct_glossaries").update({ term_count: count ?? 0 }).eq("id", id);
}

export const Route = createFileRoute("/api/glossary/$id/terms")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data: g } = await ctx.supabase.from("ct_glossaries").select("id").eq("id", params.id).maybeSingle();
        if (!g) return jerr("Glossary not found", 404);
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const term = short(b.term, 300), tr = short(b.translation, 500);
        if (!term) return jerr("Term is required");
        if (!tr && !b.doNotTranslate) return jerr("Translation is required unless Do Not Translate is enabled");
        const { data, error } = await ctx.supabase
          .from("ct_glossary_terms")
          .insert({
            glossary_id: g.id, organization_id: ctx.orgId, term, translations: tr ? { default: tr } : {},
            definition: short(b.definition, 1000), notes: short(b.notes, 1000),
            do_not_translate: !!b.doNotTranslate, keep_uppercase: !!b.keepUppercase,
          })
          .select()
          .single();
        if (error) return jerr("Could not add term", 500);
        await recount(ctx, g.id);
        return Response.json(camel(data), { status: 201 });
      },
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const termId = new URL(request.url).searchParams.get("termId");
        if (!termId) return jerr("termId required");
        const { data } = await ctx.supabase.from("ct_glossary_terms").delete().eq("id", termId).eq("glossary_id", params.id).select("id");
        if (!data?.length) return jerr("Not found", 404);
        await recount(ctx, params.id);
        return Response.json({ ok: true });
      },
    },
  },
});
