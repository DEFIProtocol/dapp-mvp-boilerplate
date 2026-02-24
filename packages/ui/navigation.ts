export type NavItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Tokens", href: "/tokens" },
  { label: "Cryptocurrencies", href: "/cryptocurrencies" },
  { label: "Account", href: "/account" },
  { label: "Admin", href: "/admin", adminOnly: true },
];