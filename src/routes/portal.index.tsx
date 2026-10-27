import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/portal/home";
import { getLinguistHome } from "@/lib/portal.functions";

export const Route = createFileRoute("/portal/")({
  loader: () => getLinguistHome(),
  head: () => ({ meta: [{ title: "Dashboard — Contentech Linguist Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => <View data={Route.useLoaderData()} />,
});
