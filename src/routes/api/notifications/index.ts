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
        const page = Math.max(Number(new URL(request.url).searchParams.get("page")) || 1, 1);
        const from = (page - 1) * limit;
        const { data, count } = await me.supabase
          .from("ct_in_app_notifications")
          .select("*", { count: "exact" })
          .eq("user_id", me.userId)
          .order("created_at", { ascending: false })
          .range(from, from + limit - 1);
        return Response.json({ notifications: camel(data ?? []), total: count ?? 0, page, limit });
      },
    },
  },
});
