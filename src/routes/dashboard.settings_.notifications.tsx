import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings_/notifications")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard/settings" });
  },
});
