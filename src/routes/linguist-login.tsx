import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/linguist-login";

export const Route = createFileRoute("/linguist-login")({
  head: () => ({
    meta: [
      { title: "Linguist Sign In — Contentech" },
      { name: "description", content: "Sign in to the Contentech linguist portal." },
      { property: "og:title", content: "Linguist Sign In — Contentech" },
      { property: "og:description", content: "Sign in to the Contentech linguist portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
