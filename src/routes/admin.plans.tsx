import { createFileRoute } from "@tanstack/react-router";
import { AdminPlans } from "@/views/admin/content";

export const Route = createFileRoute("/admin/plans")({
  head: () => ({
    meta: [
      { title: "Plans — Contentech Admin" },
      { name: "description", content: "Pricing plans." },
      { property: "og:title", content: "Plans — Contentech Admin" },
      { property: "og:description", content: "Pricing plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPlans,
});
