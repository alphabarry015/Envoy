export type NavItem = {
  label: string;
  to: string;
  hash?: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Overview", to: "/", hash: "#overview" },
  { label: "Domains", to: "/", hash: "#domains" },
  { label: "API Keys", to: "/", hash: "#api-keys" },
  { label: "Logs", to: "/", hash: "#logs" },
  { label: "Docs", to: "/docs" },
];

export function navTarget(item: NavItem): string {
  return item.hash ? `${item.to}${item.hash}` : item.to;
}

export function isNavActive(
  item: NavItem,
  pathname: string,
  hash: string,
): boolean {
  if (item.to === "/docs") {
    return pathname.startsWith("/docs");
  }
  if (pathname !== "/") {
    return false;
  }
  if (item.hash === "#overview") {
    return hash === "" || hash === "#overview";
  }
  return hash === item.hash;
}
