import { createFileRoute } from "@tanstack/react-router";
import ProjectDetailPage from "@/views/dashboard/project/detail";
import { getProjectDetail } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/dashboard/projects_/$id")({
  loader: ({ params }) => getProjectDetail({ data: { id: params.id } }),
  head: () => ({ meta: [{ title: "Project — Contentech" }] }),
  component: Page,
});

function Page() {
  const d = Route.useLoaderData();
  return <ProjectDetailPage {...d} />;
}
