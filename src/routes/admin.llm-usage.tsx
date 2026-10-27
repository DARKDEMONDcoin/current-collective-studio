import { createFileRoute } from "@tanstack/react-router";
import { AdminAiUsage } from "@/views/admin/content";

export const Route = createFileRoute("/admin/llm-usage")({
  head: () => ({
    meta: [
      { title: "LLM Usage — Contentech Admin" },
      { name: "description", content: "AI usage and cost." },
      { property: "og:title", content: "LLM Usage — Contentech Admin" },
      { property: "og:description", content: "AI usage and cost." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminAiUsage,
});
