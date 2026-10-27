import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx, parseCsvPairs } from "@/lib/org-api";

export const Route = createFileRoute("/api/glossary/$id/import")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data: g } = await ctx.supabase.from("ct_glossaries").select("id").eq("id", params.id).maybeSingle();
        if (!g) return jerr("Glossary not found", 404);
        const form = await request.formData().catch(() => null);
        const file = form?.get("file") as File | null;
        if (!file || typeof file === "string") return jerr("No file uploaded");
        if (file.size > 5_000_000) return jerr("File too large (max 5MB)");
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!["csv", "tsv", "txt"].includes(ext)) return jerr("Unsupported file type. Save Excel sheets as .csv first");
        const pairs = parseCsvPairs(await file.text()).slice(0, 10000);
        if (!pairs.length) return jerr("No valid terms found in file");
        const rows = pairs.map(([term, t]) => ({ glossary_id: g.id, organization_id: ctx.orgId, term: term.slice(0, 300), translations: { default: t.slice(0, 500) } }));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await ctx.supabase.from("ct_glossary_terms").insert(rows.slice(i, i + 500));
          if (error) return jerr("Import failed", 500);
        }
        const { count } = await ctx.supabase.from("ct_glossary_terms").select("id", { count: "exact", head: true }).eq("glossary_id", g.id);
        await ctx.supabase.from("ct_glossaries").update({ term_count: count ?? 0 }).eq("id", g.id);
        return Response.json({ imported: rows.length });
      },
    },
  },
});
