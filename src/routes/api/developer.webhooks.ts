import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx } from "@/lib/org-api";

const ALL = ["job.created", "job.completed", "job.failed", "project.completed", "project.cancelled"];
const COLS = "id,url,events,is_active,last_fired_at,failure_count,created_at";

export const Route = createFileRoute("/api/developer/webhooks")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_webhook_subscriptions").select(COLS).order("created_at", { ascending: false });
        return Response.json((camel(data ?? []) as any[]).map((s) => ({ ...s, deliveries: [] })));
      },
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        let u: URL;
        try { u = new URL(String(b.url ?? "").trim()); } catch { return jerr("Invalid URL"); }
        if (u.protocol !== "https:" && u.protocol !== "http:") return jerr("URL must be http or https");
        const events = (Array.isArray(b.events) && b.events.length ? (b.events as string[]) : ALL).filter((e) => ALL.includes(e));
        const secret = "whsec_" + [...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("");
        const { data, error } = await ctx.supabase.from("ct_webhook_subscriptions")
          .insert({ organization_id: ctx.orgId, url: u.toString().slice(0, 500), events, secret }).select(COLS).single();
        if (error) return jerr("Could not create webhook", 500);
        return Response.json({ ...camel(data), secret }, { status: 201 });
      },
    },
  },
});
