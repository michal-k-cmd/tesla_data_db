import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TESLA data DB",
  description: "Data TESLA lighting – klon ERP Helios a e-shopu, porovnání a synchronizace",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
