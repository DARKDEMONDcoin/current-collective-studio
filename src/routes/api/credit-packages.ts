import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { camel } from "@/lib/ct-shape";

export const Route = createFileRoute("/api/credit-packages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const [packages, rates] = await Promise.all([
          me.supabase.from("ct_credit_packages").select("*").eq("is_active", true).order("display_order"),
          me.supabase.from("ct_credit_rates").select("*"),
        ]);
        return Response.json({ packages: camel(packages.data ?? []), rates: camel(rates.data ?? []) });
      },
    },
  },
});
