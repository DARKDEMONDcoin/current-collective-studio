import { createFileRoute } from "@tanstack/react-router";
import { jerr, orgCtx } from "@/lib/org-api";

// Linguist profiles (active flag, language pairs) are managed by linguists themselves in the Linguist portal.
export const Route = createFileRoute("/api/organization/linguists/$id")({
  server: {
    handlers: {
      PATCH: async ({ request }) => {
        const ctx = await orgCtx(request);
        if (ctx instanceof Response) return ctx;
        return jerr("Linguist language pairs are edited by the linguist in their own portal.", 501);
      },
    },
  },
});
