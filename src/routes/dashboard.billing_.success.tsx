import { createFileRoute } from "@tanstack/react-router";
import BillingSuccessPage from "@/views/dashboard/billing/success";

export const Route = createFileRoute("/dashboard/billing_/success")({
  head: () => ({ meta: [{ title: "Payment Successful — Contentech" }] }),
  component: BillingSuccessPage,
});
