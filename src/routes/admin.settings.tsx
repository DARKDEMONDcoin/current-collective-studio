import { createFileRoute } from "@tanstack/react-router";
import { AdminSettings } from "@/views/admin/content";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Contentech Admin" },
      { name: "description", content: "Platform settings." },
      { property: "og:title", content: "Settings — Contentech Admin" },
      { property: "og:description", content: "Platform settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSettings,
});
