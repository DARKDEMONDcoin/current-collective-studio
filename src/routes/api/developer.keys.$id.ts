import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx, short } from "@/lib/org-api";

const COLS = "id,name,key_prefix,permissions,is_active,last_used_at,expires_at,created_at";

export const Route = createFileRoute("/api/developer/keys/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data: own } = await ctx.supabase.from("ct_api_keys").select("id").eq("id", params.id).maybeSingle();
        if (!own) return jerr("Not found", 404);
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const d: Record<string, unknown> = {};
        if (b.name !== undefined) d.name = short(b.name, 100);
        if (typeof b.isActive === "boolean") d.is_active = b.isActive;
        if (b.expiresAt !== undefined) {
          const e = b.expiresAt ? new Date(String(b.expiresAt)) : null;
          if (e && isNaN(e.getTime())) return jerr("Invalid expiresAt date");
          d.expires_at = e?.toISOString() ?? null;
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("ct_api_keys").update(d).eq("id", own.id).eq("organization_id", ctx.orgId).select(COLS).single();
        return Response.json(camel(data));
      },
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_api_keys").delete().eq("id", params.id).select("id");
        if (!data?.length) return jerr("Not found", 404);
        return Response.json({ ok: true });
      },
    },
  },
});
