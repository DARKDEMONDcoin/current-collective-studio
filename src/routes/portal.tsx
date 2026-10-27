import { createFileRoute } from "@tanstack/react-router";
import { NextStage } from "@/components/next-stage";

export const Route = createFileRoute("/portal")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Linguist Portal — Contentech" },
      { name: "description", content: "Contentech Linguist Portal." },
      { property: "og:title", content: "Linguist Portal — Contentech" },
      { property: "og:description", content: "Contentech Linguist Portal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => <NextStage area="Linguist Portal" loginHref="/linguist-login" />,
});
