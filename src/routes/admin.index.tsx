import { createFileRoute } from "@tanstack/react-router";
import { NextStage } from "@/components/next-stage";

export const Route = createFileRoute("/admin/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Panel — Contentech" },
      { name: "description", content: "Contentech Admin Panel." },
      { property: "og:title", content: "Admin Panel — Contentech" },
      { property: "og:description", content: "Contentech Admin Panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <NextStage area="Admin Panel" loginHref="/admin/login" />,
});
