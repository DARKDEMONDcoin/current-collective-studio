import { createFileRoute } from "@tanstack/react-router";
import WizardPage from "@/views/dashboard/wizard";

export const Route = createFileRoute("/dashboard/wizard")({
  head: () => ({ meta: [{ title: "New Order — Contentech" }] }),
  component: WizardPage,
});
