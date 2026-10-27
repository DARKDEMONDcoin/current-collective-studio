import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/org/teams";

export const Route = createFileRoute("/dashboard/organization/teams")({
  head: () => ({ meta: [{ title: "Teams — Contentech" }, { name: "description", content: "Teams in your Contentech client portal." }] }),
  component: Page,
});
