// The original pages call `fetch("/api/...")` and relied on a session cookie.
// Here the session lives in the browser, so attach the signed-in user's token
// to same-origin /api/ requests. Installed once from the root route.
import { supabase } from "@/integrations/supabase/client";

let installed = false;

export function installApiFetchAuth() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(url, window.location.origin);
    if (u.origin === window.location.origin && u.pathname.startsWith("/api/")) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
        return original(input, { ...init, headers });
      }
    }
    return original(input, init);
  };
}
