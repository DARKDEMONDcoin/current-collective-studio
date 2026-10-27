import { createFileRoute } from "@tanstack/react-router";
import { AdminResources } from "@/views/admin/content";

export const Route = createFileRoute("/admin/resources")({
  head: () => ({
    meta: [
      { title: "Resources CMS — Contentech Admin" },
      { name: "description", content: "Help articles and FAQ." },
      { property: "og:title", content: "Resources CMS — Contentech Admin" },
      { property: "og:description", content: "Help articles and FAQ." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminResources,
});
