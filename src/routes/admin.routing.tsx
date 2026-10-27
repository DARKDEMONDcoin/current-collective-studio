import { createFileRoute } from "@tanstack/react-router";
import { AdminRouting } from "@/views/admin/content";

export const Route = createFileRoute("/admin/routing")({
  head: () => ({
    meta: [
      { title: "Routing Monitor — Contentech Admin" },
      { name: "description", content: "Job assignment rules and open jobs." },
      { property: "og:title", content: "Routing Monitor — Contentech Admin" },
      { property: "og:description", content: "Job assignment rules and open jobs." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminRouting,
});
