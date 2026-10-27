import { createFileRoute } from "@tanstack/react-router";
import { AdminAiConfig } from "@/views/admin/content";

export const Route = createFileRoute("/admin/ai-config")({
  head: () => ({
    meta: [
      { title: "AI Configuration — Contentech Admin" },
      { name: "description", content: "AI model and translation policy." },
      { property: "og:title", content: "AI Configuration — Contentech Admin" },
      { property: "og:description", content: "AI model and translation policy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAiConfig,
});
