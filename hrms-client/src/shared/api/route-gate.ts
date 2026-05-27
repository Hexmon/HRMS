import { useRouterState } from "@tanstack/react-router";
import { isApiEnabled } from "./config";

export function useApiRouteEnabled(prefixes: string[], always = false): boolean {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (!isApiEnabled()) return false;
  if (always) return true;
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
