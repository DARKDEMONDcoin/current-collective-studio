import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, longText, orgCtx, short } from "@/lib/org-api";

export const Route = createFileRoute("/api/client-accounts/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const d: Record<string, string | null> = {};
        if (short(b.name, 200)) d.name = short(b.name, 200);
        if (b.notes !== undefined) d.notes = short(b.notes, 500);
        if (b.websiteUrl !== undefined) d.website_url = short(b.websiteUrl, 300);
        if (b.industry !== undefined) d.industry = short(b.industry, 120);
        if (b.companyBio !== undefined) d.company_bio = longText(b.companyBio, 1500);
        const { data } = await ctx.supabase.from("ct_client_accounts").update(d).eq("id", params.id).select().maybeSingle();
        if (!data) return jerr("Not found", 404);
        return Response.json(camel(data));
      },
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_client_accounts").delete().eq("id", params.id).select("id");
        if (!data?.length) return jerr("Not found", 404);
        return Response.json({ ok: true });
      },
    },
  },
});
