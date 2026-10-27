import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx } from "@/lib/org-api";

export const Route = createFileRoute("/api/organization/linguists/invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        return jerr("Email invitations are not available yet. Share your organization name so the linguist can request to join from the linguist sign-up page.", 501);
      },
    },
  },
});
