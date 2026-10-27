import { createFileRoute } from "@tanstack/react-router";
import { AdminSiteContent } from "@/views/admin/content";

export const Route = createFileRoute("/admin/content")({
  head: () => ({
    meta: [
      { title: "Site Content — Contentech Admin" },
      { name: "description", content: "Page text and site settings." },
      { property: "og:title", content: "Site Content — Contentech Admin" },
      { property: "og:description", content: "Page text and site settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminSiteContent,
});
