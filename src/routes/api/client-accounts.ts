import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, longText, orgCtx, short } from "@/lib/org-api";

export const Route = createFileRoute("/api/client-accounts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data, error } = await ctx.supabase
          .from("ct_client_accounts")
          .select("*, ct_translation_memories(count), ct_glossaries(count), ct_style_guides(count)")
          .order("created_at", { ascending: false });
        if (error) return jerr("Could not load clients", 500);
        return Response.json(
          (data ?? []).map((a: any) => ({
            ...camel({ ...a, ct_translation_memories: undefined, ct_glossaries: undefined, ct_style_guides: undefined }),
            projectCount: 0,
            tmCount: a.ct_translation_memories?.[0]?.count ?? 0,
            glossaryCount: a.ct_glossaries?.[0]?.count ?? 0,
            styleGuideCount: a.ct_style_guides?.[0]?.count ?? 0,
          })),
        );
      },
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const name = short(b.name, 200);
        if (!name) return jerr("name required");
        const { data, error } = await ctx.supabase
          .from("ct_client_accounts")
          .insert({
            organization_id: ctx.orgId, name, notes: short(b.notes, 500), website_url: short(b.websiteUrl, 300),
            industry: short(b.industry, 120), company_bio: longText(b.companyBio, 1500),
          })
          .select()
          .single();
        if (error) return jerr("Could not create client", 500);
        return Response.json(camel(data), { status: 201 });
      },
    },
  },
});
