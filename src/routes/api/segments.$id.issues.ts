import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

// Issue logging is not available yet.
export const Route = createFileRoute("/api/segments/$id/issues")({
  server: {
    handlers: {
      POST: async ({ request }) => ((await requireApiUser(request)) ? Response.json({ error: "Issue logging is not available yet." }, { status: 501 }) : unauthorized()),
    },
  },
});
