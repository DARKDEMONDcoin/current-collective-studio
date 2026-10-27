import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/portal/notifications";
import { getPortalNotifications } from "@/lib/portal.functions";

export const Route = createFileRoute("/portal/notifications")({
  loader: () => getPortalNotifications(),
  head: () => ({ meta: [{ title: "Notifications — Contentech Linguist Portal" }, { name: "robots", content: "noindex" }] }),
  component: () => <View data={Route.useLoaderData()} />,
});
