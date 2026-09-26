"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, FileText, Inbox, LayoutDashboard, LogOut, UserRound, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { InstallAppBanner, InstallAppButton } from "./InstallApp";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import type { User } from "@/lib/types";

export function AppShell({
  currentUser,
  active,
  children
}: {
  currentUser: User;
  active: "home" | "schedule" | "files" | "salary" | "requests";
  children: ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app-frame">
      <aside className="icon-rail" aria-label="ניווט">
        <div className="rail-logo">
          <Image src="/wecom-logo.svg" alt="wecom" width={92} height={42} priority />
        </div>
        <Link href="/" title="הדשבורד שלי" className={`rail-button ${active === "home" ? "active" : ""}`}>
          <LayoutDashboard size={20} />
        </Link>
        <Link
          href="/schedule"
          title="לוח משמרות"
          className={`rail-button ${active === "schedule" ? "active" : ""}`}
        >
          <CalendarDays size={20} />
        </Link>
        <Link href="/requests" title="בקשות" className={`rail-button ${active === "requests" ? "active" : ""}`}>
          <Inbox size={20} />
        </Link>
        <Link href="/salary" title="הערכת שכר" className={`rail-button ${active === "salary" ? "active" : ""}`}>
          <Wallet size={20} />
        </Link>
        <Link href="/files" title="קבצים" className={`rail-button ${active === "files" ? "active" : ""}`}>
          <FileText size={20} />
        </Link>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-logo">
            <Image src="/wecom-logo.svg" alt="wecom" width={104} height={47} priority />
            <span>connect</span>
          </div>
          <div className="topbar-actions">
            <InstallAppButton />
            <NotificationBell />
            <span className="user-pill">
              <UserRound size={18} />
              {currentUser.name}
            </span>
            <ThemeToggle />
            <button className="icon-button" onClick={logout} title="יציאה">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="scheduler-page">
          <InstallAppBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
