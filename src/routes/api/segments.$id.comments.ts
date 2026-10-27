import { createFileRoute } from "@tanstack/react-router";
import { requireApiUser, unauthorized } from "@/lib/api-auth";

// Segment comments are not available yet.
export const Route = createFileRoute("/api/segments/$id/comments")({
  server: {
    handlers: {
      GET: async ({ request }) => ((await requireApiUser(request)) ? Response.json([]) : unauthorized()),
      POST: async ({ request }) => ((await requireApiUser(request)) ? Response.json({ error: "Comments are not available yet." }, { status: 501 }) : unauthorized()),
    },
  },
});
