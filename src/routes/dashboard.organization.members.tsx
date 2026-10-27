import { createFileRoute } from "@tanstack/react-router";
import MembersPage from "@/views/dashboard/organization/members";

export const Route = createFileRoute("/dashboard/organization/members")({
  head: () => ({ meta: [{ title: "Members — Contentech" }] }),
  component: MembersPage,
});
