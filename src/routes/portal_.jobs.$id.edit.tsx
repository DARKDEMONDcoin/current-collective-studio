import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import View from "@/views/portal/jobs/edit";
import { getPortalShell } from "@/lib/portal.functions";

// Full-screen translation editor (original app/portal/jobs/[id]/edit). Linguists only.
export const Route = createFileRoute("/portal_/jobs/$id/edit")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/linguist-login", search: { redirect: location.href } as never });
  },
  loader: async () => {
    const shell = await getPortalShell();
    if (!shell.isLinguist) throw redirect({ to: "/dashboard" });
    return null;
  },
  head: () => ({ meta: [{ title: "Translation Editor — Contentech" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <div className="h-screen overflow-hidden bg-[#FAFBFC]">
      <View />
    </div>
  ),
});
