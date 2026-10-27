import { createFileRoute } from "@tanstack/react-router";
import { AdminUsers } from "@/views/admin/pages";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Contentech Admin" },
      { name: "description", content: "Manage Contentech accounts and roles." },
      { property: "og:title", content: "Users — Contentech Admin" },
      { property: "og:description", content: "Manage Contentech accounts and roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminUsers />,
});
