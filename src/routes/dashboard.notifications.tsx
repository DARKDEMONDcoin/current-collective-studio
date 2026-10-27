import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/notifications";

export const Route = createFileRoute("/dashboard/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Contentech" }, { name: "description", content: "Notifications in your Contentech client portal." }] }),
  component: Page,
});
