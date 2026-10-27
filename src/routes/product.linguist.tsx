import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/product/linguist";

export const Route = createFileRoute("/product/linguist")({
  head: () => ({
    meta: [
      { title: "Contentech for Linguists" },
      {
        name: "description",
        content: "Find work, translate faster with AI tools and get paid on Contentech.",
      },
      { property: "og:title", content: "Contentech for Linguists" },
      {
        property: "og:description",
        content: "Find work, translate faster with AI tools and get paid on Contentech.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
