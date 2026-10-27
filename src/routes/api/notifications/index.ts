import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";
import { camel } from "@/lib/ct-shape";

export const Route = createFileRoute("/api/notifications/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const me = await requireApiUser(request);
        if (!me) return unauthorized();
        const limit = Math.min(
          Math.max(Number(new URL(request.url).searchParams.get("limit")) || 20, 1),
          100,
        );
        const { data } = await me.supabase
          .from("ct_in_app_notifications")
          .select("*")
          .eq("user_id", me.userId)
          .order("created_at", { ascending: false })
          .limit(limit);
        return Response.json({ notifications: camel(data ?? []) });
      },
    },
  },
});
