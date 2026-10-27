import { createFileRoute } from "@tanstack/react-router";
import { AdminOverview } from "@/views/admin/pages";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Contentech Admin" },
      { name: "description", content: "Contentech platform overview." },
      { property: "og:title", content: "Admin Dashboard — Contentech Admin" },
      { property: "og:description", content: "Contentech platform overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminOverview />,
});
