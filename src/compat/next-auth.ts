// Replacement for `next-auth/react`, backed by Supabase Auth.
// Roles come from the ct_user_roles table (never from user-editable metadata).
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CtRole = "CLIENT" | "LINGUIST" | "ADMIN";
export type Session = {
  user: { id: string; email: string; name: string | null; role: CtRole | null };
} | null;

async function loadRole(userId: string): Promise<CtRole | null> {
  const { data } = await supabase.from("ct_user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as CtRole);
  if (roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("LINGUIST")) return "LINGUIST";
  if (roles.includes("CLIENT")) return "CLIENT";
  return null;
}

export async function getSession(): Promise<Session> {
  const { data } = await supabase.auth.getUser();
  const u = data.user;
  if (!u) return null;
  return {
    user: {
      id: u.id,
      email: u.email ?? "",
      name: (u.user_metadata?.full_name as string) ?? (u.user_metadata?.name as string) ?? null,
      role: await loadRole(u.id),
    },
  };
}

export async function signIn(
  _provider: string,
  opts: { email: string; password: string; redirect?: boolean; callbackUrl?: string },
): Promise<{ ok: boolean; error?: string } | undefined> {
  const { error } = await supabase.auth.signInWithPassword({
    email: opts.email,
    password: opts.password,
  });
  if (error) return { ok: false, error: "CredentialsSignin" };
  if (opts.redirect !== false && opts.callbackUrl) window.location.href = opts.callbackUrl;
  return { ok: true };
}

export async function signOut(opts?: { callbackUrl?: string; redirect?: boolean }) {
  await supabase.auth.signOut();
  if (opts?.redirect !== false) window.location.href = opts?.callbackUrl ?? "/";
}

export function useSession() {
  const [session, setSession] = useState<Session>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      getSession().then((s) => {
        if (!alive) return;
        setSession(s);
        setStatus(s ? "authenticated" : "unauthenticated");
      });
    refresh();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") refresh();
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return { data: session, status, update: async () => session };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  return children;
}
