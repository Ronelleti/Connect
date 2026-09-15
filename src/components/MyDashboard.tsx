"use client";

import { Calendar, CalendarDays, Clock3, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { addDays, formatHebrewDate } from "@/lib/dates";
import { SHIFT_DEFINITIONS } from "@/lib/shifts";
import type { ShiftType, User } from "@/lib/types";

interface DashboardStats {
  employeeName: string;
  isEmployee: boolean;
  weekShiftCount: number;
  weekHours: number;
  monthShiftCount: number;
  monthHours: number;
  nextShift: {
    weekStart: string;
    dayIndex: number;
    shiftType: ShiftType;
    startsAt: string;
  } | null;
}

export function MyDashboard({ currentUser }: { currentUser: User }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/me/dashboard", { cache: "no-store" });
      if (response.ok && !cancelled) {
        setStats((await response.json()) as DashboardStats);
      }
      if (!cancelled) {
        setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AppShell currentUser={currentUser} active="home">
      <section className="schedule-toolbar">
        <div>
          <p className="eyebrow">Wecomconnect</p>
          <h1>שלום, {currentUser.name.split(" ")[0]}</h1>
        </div>
      </section>

      {isLoading ? (
        <p className="empty-state">טוען נתונים...</p>
      ) : !stats?.isEmployee ? (
        <div className="dashboard-empty-card">
          <p>אין נתוני משמרות לחשבון זה.</p>
          <p className="dashboard-empty-hint">
            מנהלים יכולים לעבור ל<strong>לוח המשמרות</strong> כדי לנהל את הסידור השבועי.
          </p>
        </div>
      ) : (
        <div className="dashboard-grid">
          <article className="dashboard-card">
            <div className="dashboard-card-icon"><CalendarDays size={20} /></div>
            <div>
              <span className="dashboard-card-label">השבוע</span>
              <strong className="dashboard-card-value">{stats.weekShiftCount} משמרות</strong>
              <span className="dashboard-card-sub">{stats.weekHours} שעות</span>
            </div>
          </article>

          <article className="dashboard-card">
            <div className="dashboard-card-icon"><TrendingUp size={20} /></div>
            <div>
              <span className="dashboard-card-label">החודש</span>
              <strong className="dashboard-card-value">{stats.monthShiftCount} משמרות</strong>
              <span className="dashboard-card-sub">{stats.monthHours} שעות</span>
            </div>
          </article>

          <article className="dashboard-card dashboard-card-wide">
            <div className="dashboard-card-icon"><Clock3 size={20} /></div>
            <div>
              <span className="dashboard-card-label">המשמרת הבאה שלך</span>
              {stats.nextShift ? (
                <>
                  <strong className="dashboard-card-value">
                    {SHIFT_DEFINITIONS[stats.nextShift.shiftType].label}
                  </strong>
                  <span className="dashboard-card-sub">
                    <Calendar size={14} />
                    {formatHebrewDate(addDays(stats.nextShift.weekStart, stats.nextShift.dayIndex))}
                    {" · "}
                    {SHIFT_DEFINITIONS[stats.nextShift.shiftType].startsAt}-
                    {SHIFT_DEFINITIONS[stats.nextShift.shiftType].endsAt}
                  </span>
                </>
              ) : (
                <span className="dashboard-card-sub">אין משמרות עתידיות משובצות כרגע.</span>
              )}
            </div>
          </article>
        </div>
      )}
    </AppShell>
  );
}
