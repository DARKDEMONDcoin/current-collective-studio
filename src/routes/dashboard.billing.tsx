import { createFileRoute } from "@tanstack/react-router";
import BillingPage from "@/views/dashboard/billing/page";
import { getBilling } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/dashboard/billing")({
  validateSearch: (s: Record<string, unknown>) => ({
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
  }),
  loader: () => getBilling(),
  head: () => ({ meta: [{ title: "Billing — Contentech" }] }),
  component: Page,
});

function Page() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  return <BillingPage params={search} {...data} />;
}
