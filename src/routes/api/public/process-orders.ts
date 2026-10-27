import { createFileRoute } from "@tanstack/react-router";

// Called once a minute by the database scheduler to continue queued orders.
// Authenticated with a shared secret stored server-side in ct_internal_secrets.
export const Route = createFileRoute("/api/public/process-orders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const given = request.headers.get("x-cron-secret") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.from("ct_internal_secrets").select("value").eq("key", "cron_secret").maybeSingle();
        const expected = data?.value ?? "";
        let diff = given.length === expected.length && expected.length > 0 ? 0 : 1;
        for (let i = 0; i < Math.min(given.length, expected.length); i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
        if (diff !== 0) return new Response("Unauthorized", { status: 401 });
        const { processQueue } = await import("@/lib/order-pipeline.server");
        const results = await processQueue(3, 45_000);
        return Response.json({ processed: Object.keys(results).length });
      },
    },
  },
});
