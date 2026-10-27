import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/assets/memory";

export const Route = createFileRoute("/dashboard/memory")({
  head: () => ({ meta: [{ title: "Translation Memory — Contentech" }, { name: "description", content: "Translation Memory in your Contentech client portal." }] }),
  component: Page,
});
