import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { clientFilter, jerr, orgCtx, short, validClientAccount } from "@/lib/org-api";

export const Route = createFileRoute("/api/tm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const q = ctx.supabase
          .from("ct_translation_memories")
          .select("*, clientAccount:ct_client_accounts(id,name), ct_tm_entries(count)")
          .order("updated_at", { ascending: false });
        const { data, error } = await clientFilter(q as any, request.url);
        if (error) return jerr("Could not load memories", 500);
        return Response.json(
          (data ?? []).map((m: any) => ({ ...camel({ ...m, ct_tm_entries: undefined }), entryCount: m.ct_tm_entries?.[0]?.count ?? 0 })),
        );
      },
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const name = short(b.name, 200), src = short(b.sourceLanguage, 60), tgt = short(b.targetLanguage, 60);
        if (!name || !src || !tgt) return jerr("name, sourceLanguage, targetLanguage required");
        if (!(await validClientAccount(ctx, b.clientAccountId))) return jerr("Invalid client account");
        const { data, error } = await ctx.supabase
          .from("ct_translation_memories")
          .insert({ organization_id: ctx.orgId, name, source_language: src, target_language: tgt, client_account_id: (b.clientAccountId as string) || null })
          .select("*, clientAccount:ct_client_accounts(id,name)")
          .single();
        if (error) return jerr("Could not create memory", 500);
        return Response.json(camel(data), { status: 201 });
      },
    },
  },
});
