// Drop-in replacement for `next/navigation` client hooks.
import {
  notFound as tsNotFound,
  useLocation,
  useRouter as useTsRouter,
} from "@tanstack/react-router";
import { useMemo } from "react";

export function useRouter() {
  const router = useTsRouter();
  return useMemo(
    () => ({
      push: (url: string) => router.history.push(url),
      replace: (url: string) => router.history.replace(url),
      back: () => router.history.back(),
      forward: () => router.history.forward(),
      refresh: () => void router.invalidate(),
      prefetch: (_url: string) => {},
    }),
    [router],
  );
}

export function usePathname() {
  return useLocation({ select: (l) => l.pathname });
}

export function useSearchParams() {
  const searchStr = useLocation({ select: (l) => l.searchStr });
  return useMemo(() => new URLSearchParams(searchStr), [searchStr]);
}

export function notFound(): never {
  throw tsNotFound();
}
