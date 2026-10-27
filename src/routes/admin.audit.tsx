import { createFileRoute } from "@tanstack/react-router";
import { AdminAudit } from "@/views/admin/pages";

export const Route = createFileRoute("/admin/audit")({
  head: () => ({
    meta: [
      { title: "Admin Activity — Contentech Admin" },
      { name: "description", content: "Admin activity log." },
      { property: "og:title", content: "Admin Activity — Contentech Admin" },
      { property: "og:description", content: "Admin activity log." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <AdminAudit />,
});
