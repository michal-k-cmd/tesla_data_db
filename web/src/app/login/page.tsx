import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session-server";
import { MerkatosFooter } from "@/components/merkatos-footer";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentSession()) redirect("/");
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <span className="tesla-logo">
            <span className="tesla-word">TESLA</span>
            <span className="tesla-sub">lighting</span>
          </span>
          <span className="topbar-app">data DB</span>
        </div>
      </header>
      <main className="login-main">
        <div className="panel login-card">
          <h1>Přihlášení</h1>
          <p className="subtitle">
            Přihlaste se účtem vinisto platformy. Přístup má superadmin; ostatním uživatelům ho nastaví
            správce v Nastavení.
          </p>
          <LoginForm />
        </div>
      </main>
      <MerkatosFooter />
    </div>
  );
}
