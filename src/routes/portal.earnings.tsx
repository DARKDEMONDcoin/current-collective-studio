import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/portal/earnings";
import { getEarnings } from "@/lib/portal.functions";

export const Route = createFileRoute("/portal/earnings")({
  loader: () => getEarnings(),
  head: () => ({ meta: [{ title: "Earnings — Contentech Linguist Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => <View data={Route.useLoaderData()} />,
});
