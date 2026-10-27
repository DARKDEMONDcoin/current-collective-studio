import { createFileRoute } from "@tanstack/react-router";
import { camel } from "@/lib/ct-shape";
import { jerr, orgCtx } from "@/lib/org-api";

const ALL = ["job.created", "job.completed", "job.failed", "project.completed", "project.cancelled"];
const COLS = "id,url,events,is_active,last_fired_at,failure_count,created_at";

export const Route = createFileRoute("/api/developer/webhooks/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const d: any = {};
        if (Array.isArray(b.events)) d.events = (b.events as string[]).filter((e) => ALL.includes(e));
        if (typeof b.isActive === "boolean") { d.is_active = b.isActive; if (b.isActive) d.failure_count = 0; }
        const { data } = await ctx.supabase.from("ct_webhook_subscriptions").update(d).eq("id", params.id).select(COLS).maybeSingle();
        if (!data) return jerr("Not found", 404);
        return Response.json(camel(data));
      },
      DELETE: async ({ request, params }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        const { data } = await ctx.supabase.from("ct_webhook_subscriptions").delete().eq("id", params.id).select("id");
        if (!data?.length) return jerr("Not found", 404);
        return Response.json({ ok: true });
      },
    },
  },
});
