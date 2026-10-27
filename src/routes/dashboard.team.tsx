import { createFileRoute } from "@tanstack/react-router";
import TeamPage from "@/views/dashboard/team/page";
import { getTeam } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/dashboard/team")({
  loader: () => getTeam(),
  head: () => ({ meta: [{ title: "My Linguist Team — Contentech" }] }),
  component: Page,
});

function Page() {
  const d = Route.useLoaderData();
  return <TeamPage {...d} />;
}
