import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/settings";

export const Route = createFileRoute("/dashboard/settings")({
  head: () => ({ meta: [{ title: "Settings — Contentech" }, { name: "description", content: "Settings in your Contentech client portal." }] }),
  component: Page,
});
