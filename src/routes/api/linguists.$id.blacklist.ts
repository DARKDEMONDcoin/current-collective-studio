import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx, short } from "@/lib/org-api";

export const Route = createFileRoute("/api/linguists/$id/blacklist")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_linguist_blacklist").select("id").eq("linguist_id", params.id).maybeSingle();
        return Response.json({ blacklisted: !!data });
      },
      POST: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return jerr("Invalid linguist");
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const { data: ex } = await ctx.supabase.from("ct_linguist_blacklist").select("id").eq("linguist_id", params.id).maybeSingle();
        if (ex) {
          await ctx.supabase.from("ct_linguist_blacklist").delete().eq("id", ex.id);
          return Response.json({ blacklisted: false });
        }
        const { error } = await ctx.supabase.from("ct_linguist_blacklist").insert({ organization_id: ctx.orgId, customer_id: ctx.userId, linguist_id: params.id, reason: short(b.reason, 500) });
        if (error) return jerr("Could not block linguist", 500);
        await ctx.supabase.from("ct_favorite_linguists").delete().eq("customer_id", ctx.userId).eq("linguist_id", params.id);
        return Response.json({ blacklisted: true });
      },
    },
  },
});
