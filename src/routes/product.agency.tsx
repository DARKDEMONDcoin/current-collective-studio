import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/product/agency";

export const Route = createFileRoute("/product/agency")({
  head: () => ({
    meta: [
      { title: "Contentech for Agencies" },
      {
        name: "description",
        content:
          "Run your translation agency on one platform: clients, linguists, AI and delivery.",
      },
      { property: "og:title", content: "Contentech for Agencies" },
      {
        property: "og:description",
        content:
          "Run your translation agency on one platform: clients, linguists, AI and delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
