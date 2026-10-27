import { createFileRoute } from "@tanstack/react-router";
import DashboardPage from "@/views/dashboard/home";
import { getDashboardHome } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/dashboard/")({
  loader: () => getDashboardHome(),
  component: Page,
});

function Page() {
  return <DashboardPage {...Route.useLoaderData()} />;
}
