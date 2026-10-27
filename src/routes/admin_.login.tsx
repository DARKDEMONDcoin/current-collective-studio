import { createFileRoute } from "@tanstack/react-router";
import AuthLayout from "@/views/auth/layout";
import View from "@/views/auth/admin-login";

export const Route = createFileRoute("/admin_/login")({
  head: () => ({
    meta: [
      { title: "Administrator Sign In — Contentech" },
      { name: "description", content: "Sign in to the Contentech admin panel." },
      { property: "og:title", content: "Administrator Sign In — Contentech" },
      { property: "og:description", content: "Sign in to the Contentech admin panel." },
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
