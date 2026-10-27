import { createFileRoute } from "@tanstack/react-router";
import { AdminNotifications } from "@/views/admin/content";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Contentech Admin" },
      { name: "description", content: "Email templates." },
      { property: "og:title", content: "Notifications — Contentech Admin" },
      { property: "og:description", content: "Email templates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminNotifications,
});
