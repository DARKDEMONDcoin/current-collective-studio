import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx } from "@/lib/org-api";

export const Route = createFileRoute("/api/linguists/$id/favorite")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_favorite_linguists").select("id").eq("customer_id", ctx.userId).eq("linguist_id", params.id).maybeSingle();
        return Response.json({ favorited: !!data });
      },
      POST: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        if (!/^[0-9a-f-]{36}$/i.test(params.id)) return jerr("Invalid linguist");
        const { data: ex } = await ctx.supabase.from("ct_favorite_linguists").select("id").eq("customer_id", ctx.userId).eq("linguist_id", params.id).maybeSingle();
        if (ex) {
          await ctx.supabase.from("ct_favorite_linguists").delete().eq("id", ex.id);
          return Response.json({ favorited: false });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: isL } = await supabaseAdmin.from("ct_user_roles").select("id").eq("user_id", params.id).eq("role", "LINGUIST").maybeSingle();
        if (!isL) return jerr("Linguist not found", 404);
        const { error } = await ctx.supabase.from("ct_favorite_linguists").insert({ customer_id: ctx.userId, linguist_id: params.id, organization_id: ctx.orgId });
        if (error) return jerr("Could not save favourite", 500);
        await ctx.supabase.from("ct_linguist_blacklist").delete().eq("linguist_id", params.id);
        return Response.json({ favorited: true });
      },
    },
  },
});
