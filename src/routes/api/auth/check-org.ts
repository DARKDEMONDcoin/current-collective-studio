import { createFileRoute } from "@tanstack/react-router";

// Organizations arrive with the client-portal stage; until then every name is new.
export const Route = createFileRoute("/api/auth/check-org")({
  server: { handlers: { GET: async () => Response.json({ exists: false }) } },
});
