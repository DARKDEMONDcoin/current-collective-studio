import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx, short } from "@/lib/org-api";

const ALL = ["projects:read", "projects:write", "jobs:read", "jobs:write"];
const COLS = "id,name,key_prefix,permissions,is_active,last_used_at,expires_at,created_at";
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export const Route = createFileRoute("/api/developer/keys")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_api_keys").select(COLS).order("created_at", { ascending: false });
        return Response.json(camel(data ?? []));
      },
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const name = short(b.name, 100);
        if (!name) return jerr("name is required");
        const perms = (Array.isArray(b.permissions) ? (b.permissions as string[]) : ALL).filter((p) => ALL.includes(p));
        const exp = b.expiresAt ? new Date(String(b.expiresAt)) : null;
        if (exp && isNaN(exp.getTime())) return jerr("Invalid expiresAt date");
        const raw = "ctk_live_" + hex(crypto.getRandomValues(new Uint8Array(24)));
        const hash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.from("ct_api_keys")
          .insert({ organization_id: ctx.orgId, name, key_prefix: raw.slice(0, 16), key_hash: hash, permissions: perms, expires_at: exp?.toISOString() ?? null })
          .select(COLS).single();
        if (error) return jerr("Could not create key", 500);
        return Response.json({ ...camel(data), key: raw }, { status: 201 });
      },
    },
  },
});
