import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { SUPPORTED_LOCALES } from "@/lib/locales";

export const Route = createFileRoute("/$locale")({
  beforeLoad: ({ params }) => {
    if (!(SUPPORTED_LOCALES as readonly string[]).includes(params.locale)) throw notFound();
  },
  component: () => <Outlet />,
});
