export type NavChildItem = {
  label: string;
  href: string;
};

export type NavItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
  matchPaths?: string[];
  children?: NavChildItem[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Markets", href: "/market/base", matchPaths: ["/market"] },
  {
    label: "Trade",
    href: "/futures",
    matchPaths: ["/futures", "/options", "/spot"],
    children: [
      { label: "Futures", href: "/futures" },
      { label: "Options", href: "/options" },
      { label: "Spot", href: "/spot" },
    ],
  },
  { label: "Account", href: "/account", matchPaths: ["/account"] },
  { label: "Admin", href: "/admin", adminOnly: true, matchPaths: ["/admin"] },
];