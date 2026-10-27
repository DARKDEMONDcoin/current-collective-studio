import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/support";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — Contentech" },
      {
        name: "description",
        content: "Get help with the Contentech platform: tickets, guides and contact options.",
      },
      { property: "og:title", content: "Support — Contentech" },
      {
        property: "og:description",
        content: "Get help with the Contentech platform: tickets, guides and contact options.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
