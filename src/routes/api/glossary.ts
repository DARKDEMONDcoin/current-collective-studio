import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { clientFilter, jerr, orgCtx, short, validClientAccount } from "@/lib/org-api";

export const Route = createFileRoute("/api/glossary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const q = ctx.supabase
          .from("ct_glossaries")
          .select("*, clientAccount:ct_client_accounts(id,name), terms:ct_glossary_terms(*)")
          .order("updated_at", { ascending: false })
          .order("created_at", { referencedTable: "ct_glossary_terms", ascending: true })
          .limit(200, { referencedTable: "ct_glossary_terms" });
        const { data, error } = await clientFilter(q as any, request.url);
        if (error) return jerr("Could not load glossaries", 500);
        return Response.json(camel(data ?? []));
      },
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const name = short(b.name, 200);
        if (!name) return jerr("name required");
        if (!(await validClientAccount(ctx, b.clientAccountId))) return jerr("Invalid client account");
        const languages = Array.isArray(b.languages) ? b.languages.map((l) => short(l, 60)).filter(Boolean) : [];
        const { data, error } = await ctx.supabase
          .from("ct_glossaries")
          .insert({ organization_id: ctx.orgId, name, languages: languages as string[], client_account_id: (b.clientAccountId as string) || null })
          .select("*, clientAccount:ct_client_accounts(id,name)")
          .single();
        if (error) return jerr("Could not create glossary", 500);
        return Response.json({ ...camel(data), terms: [] }, { status: 201 });
      },
    },
  },
});
