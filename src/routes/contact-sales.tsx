import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/contact-sales";

export const Route = createFileRoute("/contact-sales")({
  head: () => ({
    meta: [
      { title: "Contact Sales — Contentech" },
      { name: "description", content: "Talk to the Contentech team about enterprise translation." },
      { property: "og:title", content: "Contact Sales — Contentech" },
      {
        property: "og:description",
        content: "Talk to the Contentech team about enterprise translation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
