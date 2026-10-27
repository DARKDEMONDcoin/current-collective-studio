import { createFileRoute } from "@tanstack/react-router";
import { AdminUsers } from "@/views/admin/pages";

export const Route = createFileRoute("/admin/linguists")({
  head: () => ({
    meta: [
      { title: "Linguists — Contentech Admin" },
      { name: "description", content: "Manage Contentech linguists." },
      { property: "og:title", content: "Linguists — Contentech Admin" },
      { property: "og:description", content: "Manage Contentech linguists." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminUsers only="LINGUIST" />,
});
