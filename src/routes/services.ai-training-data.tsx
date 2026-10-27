import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/services/ai-training-data";

export const Route = createFileRoute("/services/ai-training-data")({
  head: () => ({
    meta: [
      { title: "AI Training Data — Contentech" },
      {
        name: "description",
        content: "Multilingual data collection, annotation and evaluation for AI teams.",
      },
      { property: "og:title", content: "AI Training Data — Contentech" },
      {
        property: "og:description",
        content: "Multilingual data collection, annotation and evaluation for AI teams.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
