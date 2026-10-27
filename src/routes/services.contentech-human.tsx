import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/services/contentech-human";

export const Route = createFileRoute("/services/contentech-human")({
  head: () => ({
    meta: [
      { title: "Contentech Human — Certified Translation" },
      { name: "description", content: "Certified human linguists for high-stakes content." },
      { property: "og:title", content: "Contentech Human — Certified Translation" },
      { property: "og:description", content: "Certified human linguists for high-stakes content." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
