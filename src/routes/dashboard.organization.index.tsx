import { createFileRoute, redirect } from "@tanstack/react-router";
import OrganizationGeneralPage from "@/views/dashboard/organization/general";
import { getOrganizationGeneral } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/dashboard/organization/")({
  loader: async () => {
    const d = await getOrganizationGeneral();
    if (!d.org) throw redirect({ to: "/dashboard" });
    return d;
  },
  head: () => ({ meta: [{ title: "Organization — Contentech" }] }),
  component: Page,
});

function Page() {
  const { org, userRole } = Route.useLoaderData();
  return <OrganizationGeneralPage org={org} userRole={userRole} />;
}
