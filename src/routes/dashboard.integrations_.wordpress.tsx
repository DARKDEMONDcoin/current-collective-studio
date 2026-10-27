import { createFileRoute } from "@tanstack/react-router";
import CmsPending from "@/views/dashboard/dev/cms-pending";

export const Route = createFileRoute("/dashboard/integrations_/wordpress")({
  head: () => ({ meta: [{ title: "WordPress integration — Contentech" }, { name: "description", content: "Connect WordPress to Contentech." }] }),
  component: () => <CmsPending name="WordPress" />,
});
