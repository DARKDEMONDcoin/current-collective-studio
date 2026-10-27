import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/dashboard/sidebar";
import DashboardTopBar from "@/components/dashboard/topbar";
import { getAdminShell } from "@/lib/admin.functions";
import { useTranslation } from "@/lib/i18n/client";

// Admin Panel layout (original app/admin/layout.tsx). ADMIN role only; every server function re-checks it.
export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/admin/login", search: { redirect: location.href } as never });
  },
  loader: async () => {
    const shell = await getAdminShell();
    if (!shell.isAdmin) throw redirect({ to: "/dashboard" });
    return shell;
  },
  head: () => ({
    meta: [
      { title: "Admin Panel — Contentech" },
      { name: "description", content: "Contentech Admin Panel." },
      { property: "og:title", content: "Admin Panel — Contentech" },
      { property: "og:description", content: "Contentech Admin Panel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
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
