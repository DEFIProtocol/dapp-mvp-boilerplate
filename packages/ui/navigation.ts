export type NavItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Markets", href: "/market/base" },
  { label: "Futures", href: "/futures" },
  { label: "Account", href: "/account" },
  { label: "Admin", href: "/admin", adminOnly: true },
];