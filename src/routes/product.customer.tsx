import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/product/customer";

export const Route = createFileRoute("/product/customer")({
  head: () => ({
    meta: [
      { title: "Contentech for Businesses" },
      {
        name: "description",
        content: "Order, track and manage multilingual content with AI speed and human accuracy.",
      },
      { property: "og:title", content: "Contentech for Businesses" },
      {
        property: "og:description",
        content: "Order, track and manage multilingual content with AI speed and human accuracy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
