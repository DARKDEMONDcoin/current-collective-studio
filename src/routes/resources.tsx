import { createFileRoute, Outlet } from "@tanstack/react-router";
import ResourcesLayout from "@/views/resources/layout";

export const Route = createFileRoute("/resources")({
  component: () => (
    <ResourcesLayout>
      <Outlet />
    </ResourcesLayout>
  ),
});
