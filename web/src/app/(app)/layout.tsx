import { redirect } from "next/navigation";
import { APP_SECTIONS, hasSection } from "@/config/app-sections";
import { currentSession, sessionSections } from "@/lib/session-server";
import { LogoutButton } from "@/components/logout-button";
import { MerkatosFooter } from "@/components/merkatos-footer";
import { SidebarNav } from "@/components/sidebar-nav";
import { TeslaLogo } from "@/components/tesla-logo";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/login");
  const sections = sessionSections(session);
  const items = APP_SECTIONS.filter((s) => hasSection(sections, s.key)).map(({ href, label, icon }) => ({ href, label, icon }));

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <TeslaLogo />
          <span className="topbar-app">data DB · ERP a e-shop</span>
          <div className="topbar-right">
            <span className="topbar-mail">{session.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main>
        <div className="layout">
          <aside className="sidebar">
            <SidebarNav items={items} />
          </aside>
          <div className="content">{children}</div>
        </div>
      </main>
      <MerkatosFooter />
    </div>
  );
}
