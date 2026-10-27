import { createFileRoute } from "@tanstack/react-router";
import AuthLayout from "@/views/auth/layout";
import View from "@/views/auth/login";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — Contentech" },
      { name: "description", content: "Sign in to your Contentech client workspace." },
      { property: "og:title", content: "Sign In — Contentech" },
      { property: "og:description", content: "Sign in to your Contentech client workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AuthLayout>
      <View />
    </AuthLayout>
  ),
});
