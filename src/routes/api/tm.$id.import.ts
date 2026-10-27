import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx, parseCsvPairs, parseTmxPairs } from "@/lib/org-api";

export const Route = createFileRoute("/api/tm/$id/import")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data: tm } = await ctx.supabase.from("ct_translation_memories").select("id,source_language,target_language").eq("id", params.id).maybeSingle();
        if (!tm) return jerr("TM not found", 404);
        const form = await request.formData().catch(() => null);
        const file = form?.get("file") as File | null;
        if (!file || typeof file === "string") return jerr("No file uploaded");
        if (file.size > 10_000_000) return jerr("File too large (max 10MB)");
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        const text = await file.text();
        let pairs: [string, string][];
        if (ext === "tmx" || ext === "xml") pairs = parseTmxPairs(text, tm.source_language, tm.target_language);
        else if (ext === "csv" || ext === "tsv" || ext === "txt") pairs = parseCsvPairs(text);
        else return jerr("Unsupported file type. Use .tmx or .csv");
        const uniq = new Map(pairs.map(([s, t]) => [s.slice(0, 5000), t.slice(0, 5000)]));
        if (!uniq.size) return jerr("No valid entries found in file");
        const rows = [...uniq].slice(0, 20000).map(([source_text, target_text]) => ({ tm_id: tm.id, organization_id: ctx.orgId, source_text, target_text, created_by: "import" }));
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await ctx.supabase.from("ct_tm_entries").upsert(rows.slice(i, i + 500), { onConflict: "tm_id,source_text" });
          if (error) return jerr("Import failed", 500);
        }
        const { count } = await ctx.supabase.from("ct_tm_entries").select("id", { count: "exact", head: true }).eq("tm_id", tm.id);
        await ctx.supabase.from("ct_translation_memories").update({ entry_count: count ?? rows.length }).eq("id", tm.id);
        return Response.json({ imported: rows.length });
      },
    },
  },
});
