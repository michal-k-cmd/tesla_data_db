// Patička s provozovatelem – appku vyvíjí a provozuje merkatos (www.merkatos.cz).
// Stejná jako ve vinisto data DB / portálu statistik.

export function MerkatosFooter() {
  return (
    <footer className="app-footer">
      <span className="footer-brand">
        <a href="https://www.merkatos.cz" target="_blank" rel="noreferrer" aria-label="merkatos.cz">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/merkatos-logo.png" alt="merkatos" width={512} height={186} />
        </a>
        <span className="footer-tagline">marketplace &amp; fulfillment v jednom</span>
      </span>
      <span className="footer-credit">
        TESLA data DB vyvíjí a provozuje{" "}
        <a href="https://www.merkatos.cz" target="_blank" rel="noreferrer">merkatos.cz</a>{" "}
        · © {new Date().getFullYear()}
      </span>
    </footer>
  );
}
