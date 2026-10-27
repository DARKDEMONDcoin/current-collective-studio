import { createFileRoute } from "@tanstack/react-router";
import ProjectsPage from "@/views/dashboard/projects";
import { getProjectsList } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/dashboard/projects")({
  loader: () => getProjectsList(),
  head: () => ({ meta: [{ title: "Projects — Contentech" }] }),
  component: Page,
});

function Page() {
  return <ProjectsPage projects={Route.useLoaderData()} />;
}
