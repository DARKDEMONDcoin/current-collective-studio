import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/services/ai-quality-shield";

export const Route = createFileRoute("/services/ai-quality-shield")({
  head: () => ({
    meta: [
      { title: "AI Quality Shield — Contentech" },
      { name: "description", content: "Human review that catches what AI translation misses." },
      { property: "og:title", content: "AI Quality Shield — Contentech" },
      {
        property: "og:description",
        content: "Human review that catches what AI translation misses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
