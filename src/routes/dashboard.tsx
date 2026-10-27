import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardTopBar from "@/components/dashboard/topbar";
import ImpersonationBanner from "@/components/admin/impersonation-banner";
import { getDashboardShell } from "@/lib/dashboard.functions";
import { useTranslation } from "@/lib/i18n/client";

// Client portal layout (original app/(dashboard)/layout.tsx). Signed-in clients only.
export const Route = createFileRoute("/dashboard")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login", search: { redirect: location.href } as never });
  },
  loader: () => getDashboardShell(),
  head: () => ({
    meta: [
      { title: "Client Portal — Contentech" },
      {
        name: "description",
        content: "Manage your Contentech translation projects, team and billing.",
      },
      { property: "og:title", content: "Client Portal — Contentech" },
      {
        property: "og:description",
        content: "Manage your Contentech translation projects, team and billing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, orgPlan, featureFlags } = Route.useLoaderData();
  const { lang } = useTranslation();
  return (
    <div className="flex h-screen bg-[#F5F8FA] overflow-hidden">
      <DashboardSidebar user={user} orgPlan={orgPlan} featureFlags={featureFlags} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <ImpersonationBanner />
        <DashboardTopBar locale={lang} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
