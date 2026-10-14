import Link from "next/link";

// Dočasný textový wordmark – logo TESLA lighting doplníme z brand manuálu
// (repo TESLA_WEB je zatím prázdné).
export function TeslaLogo() {
  return (
    <Link href="/" className="tesla-logo" aria-label="TESLA lighting – přehled">
      <span className="tesla-word">TESLA</span>
      <span className="tesla-sub">lighting</span>
    </Link>
  );
}
