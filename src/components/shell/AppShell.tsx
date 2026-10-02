"use client";

import {
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ROLE_LABELS } from "@/lib/permissions";
import type { User } from "@/lib/types";
import type { ShellNav } from "@/server/shell";
import { InstallAppBanner, InstallAppButton } from "../InstallApp";
import { NotificationBell } from "../NotificationBell";
import { ThemeToggle } from "../ThemeToggle";
import { Avatar } from "../ui/Avatar";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  show: boolean;
  tab?: boolean;
}

export interface ShellProps {
  user: User;
  nav: ShellNav;
  teamName: string | null;
  teamColorSlot?: number | null;
}

export function AppShell({
  user,
  nav,
  teamName,
  teamColorSlot,
  title,
  subtitle,
  actions,
  children
}: ShellProps & { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const items: NavItem[] = [
    { href: "/", label: "בית", icon: LayoutDashboard, show: true, tab: true },
    { href: "/schedule", label: "סידור", icon: CalendarDays, show: true, tab: true },
    { href: "/availability", label: "זמינות", icon: CalendarCheck2, show: Boolean(user.teamId), tab: true },
    { href: "/requests", label: "בקשות", icon: Inbox, show: true, tab: true },
    { href: "/insights", label: "תובנות", icon: BarChart3, show: nav.insights },
    { href: "/people", label: "אנשים", icon: UsersRound, show: true },
    { href: "/settings", label: "צוותים ומשמרות", icon: Settings2, show: nav.settings },
    { href: "/files", label: "קבצים", icon: FileText, show: true }
  ].filter((item) => item.show);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleLine = [ROLE_LABELS[user.role], teamName].filter(Boolean).join(" · ");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Image src="/wecom-logo.svg" alt="wecom" width={96} height={44} priority />
          <span>connect</span>
        </div>
        <p className="sidebar-sub">תמיכה ומכירות</p>
        <nav aria-label="ניווט ראשי" style={{ display: "grid", gap: 2 }}>
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link" aria-current={isActive(item.href) ? "page" : undefined}>
              <item.icon size={19} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <Avatar name={user.name} colorSlot={teamColorSlot} />
            <div>
              <strong>{user.name}</strong>
              <span>{roleLine}</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <ThemeToggle />
            <button type="button" className="secondary-button small" onClick={logout} style={{ flex: 1 }}>
              <LogOut size={16} />
              יציאה
            </button>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-brand">
            <Image src="/wecom-logo.svg" alt="wecom" width={64} height={30} priority />
          </div>
          <div className="topbar-titles">
            <h1>{title}</h1>
            {subtitle ? <span className="topbar-sub">{subtitle}</span> : null}
          </div>
          <div className="topbar-actions">
            {actions}
            <InstallAppButton />
            <NotificationBell />
          </div>
        </header>
        <main className="content" id="main">
          <InstallAppBanner />
          <h1 className="sr-only">{title}</h1>
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label="ניווט">
        {items
          .filter((item) => item.tab)
          .map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}>
              <item.icon size={21} />
              {item.label}
            </Link>
          ))}
        <button type="button" onClick={() => setMoreOpen((open) => !open)} aria-expanded={moreOpen} aria-current={items.some((item) => !item.tab && isActive(item.href)) ? "page" : undefined}>
          <Menu size={21} />
          עוד
        </button>
      </nav>
      {moreOpen ? (
        <>
          <div className="modal-backdrop" style={{ background: "transparent", backdropFilter: "none" }} onClick={() => setMoreOpen(false)} />
          <div className="more-menu" role="menu">
            {items
              .filter((item) => !item.tab)
              .map((item) => (
                <Link key={item.href} href={item.href} className="nav-link" role="menuitem" onClick={() => setMoreOpen(false)} aria-current={isActive(item.href) ? "page" : undefined}>
                  <item.icon size={19} />
                  {item.label}
                </Link>
              ))}
            <div className="sidebar-footer" style={{ marginTop: 6 }}>
              <div className="sidebar-user">
                <Avatar name={user.name} colorSlot={teamColorSlot} />
                <div>
                  <strong>{user.name}</strong>
                  <span>{roleLine}</span>
                </div>
              </div>
              <div className="sidebar-actions">
                <ThemeToggle />
                <button type="button" className="secondary-button small" onClick={logout} style={{ flex: 1 }}>
                  <LogOut size={16} />
                  יציאה
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
