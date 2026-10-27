import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/portal/assignments";
import { getAssignments } from "@/lib/portal.functions";

export const Route = createFileRoute("/portal/assignments")({
  loader: () => getAssignments(),
  head: () => ({ meta: [{ title: "Assignments — Contentech Linguist Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => <View data={Route.useLoaderData()} />,
});
