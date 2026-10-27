import { createFileRoute } from "@tanstack/react-router";
import AuthLayout from "@/views/auth/layout";
import View from "@/views/auth/register";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create Account — Contentech" },
      { name: "description", content: "Create your Contentech client account and workspace." },
      { property: "og:title", content: "Create Account — Contentech" },
      {
        property: "og:description",
        content: "Create your Contentech client account and workspace.",
      },
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
