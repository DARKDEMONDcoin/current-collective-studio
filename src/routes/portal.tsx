import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardTopBar from "@/components/dashboard/topbar";
import { getPortalShell } from "@/lib/portal.functions";
import { useTranslation } from "@/lib/i18n/client";

// Linguist Portal layout (original app/portal/layout.tsx). Linguists and admins only.
export const Route = createFileRoute("/portal")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/linguist-login", search: { redirect: location.href } as never });
  },
  loader: async () => {
    const shell = await getPortalShell();
    if (!shell.isLinguist) throw redirect({ to: "/dashboard" });
    return shell;
  },
  head: () => ({
    meta: [
      { title: "Linguist Portal — Contentech" },
      { name: "description", content: "Find translation jobs, edit in the Contentech editor and track your earnings." },
      { property: "og:title", content: "Linguist Portal — Contentech" },
      { property: "og:description", content: "Find translation jobs, edit in the Contentech editor and track your earnings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PortalLayout,
});

function PortalLayout() {
  const { user } = Route.useLoaderData();
  const { lang } = useTranslation();
  return (
    <div className="flex h-screen bg-[#F5F8FA] overflow-hidden">
      <DashboardSidebar user={user as any} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardTopBar locale={lang} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
