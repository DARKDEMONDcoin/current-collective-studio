import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx } from "@/lib/org-api";

// Email invitations to teams need the email service (not set up yet); existing members can be added directly.
export const Route = createFileRoute("/api/departments/$id/invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        return jerr("Email invitations are not available yet. Add people who are already members of your organization.", 501);
      },
    },
  },
});
