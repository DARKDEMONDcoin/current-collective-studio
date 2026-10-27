import { createFileRoute } from "@tanstack/react-router";
import View from "@/views/linguist-register";

export const Route = createFileRoute("/linguist-register")({
  head: () => ({
    meta: [
      { title: "Join as a Linguist — Contentech" },
      { name: "description", content: "Create your Contentech linguist account." },
      { property: "og:title", content: "Join as a Linguist — Contentech" },
      { property: "og:description", content: "Create your Contentech linguist account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: View,
});
