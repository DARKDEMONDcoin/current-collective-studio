import { createFileRoute } from "@tanstack/react-router";
import Page from "@/views/dashboard/dev/developer";

export const Route = createFileRoute("/dashboard/developer")({
  head: () => ({ meta: [{ title: "Developer SDK — Contentech" }, { name: "description", content: "Developer SDK in your Contentech client portal." }] }),
  component: Page,
});
