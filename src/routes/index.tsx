import { createFileRoute, redirect } from "@tanstack/react-router";

// The original site sends "/" to the English home page.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/$locale", params: { locale: "en" } });
  },
});
