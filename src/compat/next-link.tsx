// Drop-in replacement for `next/link` so imported pages keep working unchanged.
import * as React from "react";
import { useRouter } from "@tanstack/react-router";

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string | { pathname?: string; query?: Record<string, string> };
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  legacyBehavior?: boolean;
  passHref?: boolean;
};

function toHref(href: Props["href"]) {
  if (typeof href === "string") return href;
  const q = href.query ? "?" + new URLSearchParams(href.query).toString() : "";
  return (href.pathname ?? "") + q;
}

const Link = React.forwardRef<HTMLAnchorElement, Props>(function Link(
  {
    href,
    prefetch: _p,
    replace,
    scroll: _s,
    legacyBehavior: _l,
    passHref: _ph,
    onClick,
    target,
    ...rest
  },
  ref,
) {
  const router = useRouter();
  const url = toHref(href);
  const internal = url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/api/");
  return (
    <a
      ref={ref}
      href={url}
      target={target}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !internal || target === "_blank") return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        router.history[replace ? "replace" : "push"](url);
      }}
      {...rest}
    />
  );
});

export default Link;
