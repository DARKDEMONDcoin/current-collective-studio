import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/dev/integrations";

export const Route = createFileRoute("/dashboard/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Contentech" }, { name: "description", content: "Integrations in your Contentech client portal." }] }),
  component: Page,
});
