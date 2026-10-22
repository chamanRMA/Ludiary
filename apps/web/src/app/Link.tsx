import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { navigate, useLocation } from "./router";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string; activePrefix?: string };

/** A real `<a href>`; plain left clicks navigate without reloading. `aria-current` marks the active route. */
export function Link({ to, activePrefix, onClick, ...rest }: Props) {
  const { path } = useLocation();
  const onLinkClick = (e: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  const active = activePrefix ? path.startsWith(activePrefix) : path === to.split("?")[0];
  return <a {...rest} href={to} onClick={onLinkClick} {...(active ? { "aria-current": "page" as const } : {})} />;
}
