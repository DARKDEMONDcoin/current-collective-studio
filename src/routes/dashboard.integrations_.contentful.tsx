import { createFileRoute } from "@tanstack/react-router";
import CmsPending from "@/views/dashboard/dev/cms-pending";

export const Route = createFileRoute("/dashboard/integrations_/contentful")({
  head: () => ({ meta: [{ title: "Contentful integration — Contentech" }, { name: "description", content: "Connect Contentful to Contentech." }] }),
  component: () => <CmsPending name="Contentful" />,
});
