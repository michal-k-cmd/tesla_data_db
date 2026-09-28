// Sekce appky pro práva uživatelů (Nastavení → uživatelé a práva).
// Klíče odpovídají položkám menu; superadmin vinisto platformy má vždy vše
// (sections = ["*"]), ostatní jen to, co jim superadmin nastaví v app_users.

export type AppSection = { key: string; label: string; href: string; icon: string };

export const APP_SECTIONS: AppSection[] = [
  { key: "dashboard", label: "Přehled", href: "/", icon: "home" },
  { key: "helios", label: "Helios (ERP)", href: "/helios", icon: "database" },
  { key: "shoptet", label: "E-shop (Shoptet)", href: "/shoptet", icon: "cart" },
  { key: "compare", label: "Porovnání dat", href: "/porovnani", icon: "compare" },
  { key: "logs", label: "Logy", href: "/logy", icon: "list" },
  { key: "settings", label: "Nastavení", href: "/nastaveni", icon: "settings" },
];

export const APP_SECTION_KEYS = new Set(APP_SECTIONS.map((s) => s.key));

/** má uživatel se seznamem sekcí přístup do dané sekce? ("*" = vše) */
export function hasSection(sections: string[] | undefined, section: string): boolean {
  if (!sections) return false;
  return sections.includes("*") || sections.includes(section);
}
