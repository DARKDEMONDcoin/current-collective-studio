import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/assets/style-guides";

export const Route = createFileRoute("/dashboard/style-guides")({
  head: () => ({ meta: [{ title: "Style Guides — Contentech" }, { name: "description", content: "Style Guides in your Contentech client portal." }] }),
  component: Page,
});
