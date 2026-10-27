import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/assets/glossary";

export const Route = createFileRoute("/dashboard/glossary")({
  head: () => ({ meta: [{ title: "Glossaries — Contentech" }, { name: "description", content: "Glossaries in your Contentech client portal." }] }),
  component: Page,
});
