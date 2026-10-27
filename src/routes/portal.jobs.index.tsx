import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/portal/jobs";
import { getJobFeed } from "@/lib/portal.functions";

export const Route = createFileRoute("/portal/jobs/")({
  loader: () => getJobFeed(),
  head: () => ({ meta: [{ title: "Job Feed — Contentech Linguist Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => <View data={Route.useLoaderData()} />,
});
