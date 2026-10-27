import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/org/linguists";

export const Route = createFileRoute("/dashboard/organization/linguists")({
  head: () => ({ meta: [{ title: "Linguists — Contentech" }, { name: "description", content: "Linguists in your Contentech client portal." }] }),
  component: Page,
});
