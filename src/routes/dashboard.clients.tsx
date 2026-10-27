import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/clients";

export const Route = createFileRoute("/dashboard/clients")({
  head: () => ({ meta: [{ title: "Clients — Contentech" }, { name: "description", content: "Clients in your Contentech client portal." }] }),
  component: Page,
});
