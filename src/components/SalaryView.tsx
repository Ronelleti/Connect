"use client";

import { Banknote, CalendarClock, ChevronLeft, ChevronRight, Moon, Save, Wallet } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { AppShell } from "./AppShell";
import { formatHebrewDate } from "@/lib/dates";
import { DEFAULT_TAX_CREDIT_POINTS, NIGHT_PREMIUM_RATE, type SalaryEstimate } from "@/lib/salary";
import type { User } from "@/lib/types";

interface SalaryResponse {
  isEmployee: boolean;
  period?: { start: string; lastDay: string; payday: string };
  settings?: { hourlyWage: number; taxCreditPoints: number } | null;
  shiftCount?: number;
  upcomingShiftCount?: number;
  estimate?: SalaryEstimate | null;
}

const currency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0
});

function formatMoney(value: number) {
  return currency.format(value);
}

export function SalaryView({ currentUser }: { currentUser: User }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<SalaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hourlyWage, setHourlyWage] = useState("");
  const [taxCreditPoints, setTaxCreditPoints] = useState(String(DEFAULT_TAX_CREDIT_POINTS));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch(`/api/me/salary?offset=${offset}`, { cache: "no-store" });
      const body = (await response.json().catch(() => null)) as SalaryResponse | null;
      if (cancelled) {
        return;
      }
      if (response.ok && body) {
        setData(body);
        if (body.settings) {
          setHourlyWage(String(body.settings.hourlyWage));
          setTaxCreditPoints(String(body.settings.taxCreditPoints));
        }
      }
      setIsLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [offset, reloadKey]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/me/salary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hourlyWage, taxCreditPoints })
    });
    const body = await response.json().catch(() => ({}));
    setIsSaving(false);
    if (!response.ok) {
      setMessage(body.error ?? "השמירה נכשלה.");
      return;
    }
    setMessage("הפרטים נשמרו.");
    setReloadKey((key) => key + 1);
  }

  const estimate = data?.estimate ?? null;
  const period = data?.period;

  return (
    <AppShell currentUser={currentUser} active="salary">
      <section className="schedule-toolbar">
        <div>
          <p className="eyebrow">Wecomconnect</p>
          <h1>הערכת שכר</h1>
        </div>
        {period ? (
          <div className="toolbar-controls">
            <button className="soft-button" onClick={() => setOffset(offset - 1)} title="תקופה קודמת">
              <ChevronRight size={18} />
            </button>
            <div className="week-pill">
              {formatHebrewDate(period.start)} - {formatHebrewDate(period.lastDay)}
            </div>
            <button className="soft-button" onClick={() => setOffset(offset + 1)} title="תקופה הבאה">
              <ChevronLeft size={18} />
            </button>
          </div>
        ) : null}
      </section>

      {isLoading ? (
        <p className="empty-state">טוען נתונים...</p>
      ) : !data?.isEmployee ? (
        <div className="dashboard-empty-card">
          <p>אין רשומת עובד המקושרת לחשבון זה, ולכן אין נתוני שכר להצגה.</p>
        </div>
      ) : (
        <>
          <div className="dashboard-grid">
            <article className="dashboard-card">
              <div className="dashboard-card-icon"><Wallet size={20} /></div>
              <div>
                <span className="dashboard-card-label">ברוטו משוער</span>
                <strong className="dashboard-card-value">
                  {estimate ? formatMoney(estimate.gross) : "—"}
                </strong>
                <span className="dashboard-card-sub">
                  {data.shiftCount} משמרות
                  {data.upcomingShiftCount ? ` (${data.upcomingShiftCount} עוד לפניך)` : ""}
                </span>
              </div>
            </article>

            <article className="dashboard-card">
              <div className="dashboard-card-icon"><Banknote size={20} /></div>
              <div>
                <span className="dashboard-card-label">נטו משוער</span>
                <strong className="dashboard-card-value">
                  {estimate ? formatMoney(estimate.net) : "—"}
                </strong>
                <span className="dashboard-card-sub">הערכה בלבד</span>
              </div>
            </article>

            <article className="dashboard-card">
              <div className="dashboard-card-icon"><CalendarClock size={20} /></div>
              <div>
                <span className="dashboard-card-label">מועד תשלום</span>
                <strong className="dashboard-card-value">
                  {period ? formatHebrewDate(period.payday) : "—"}
                </strong>
                <span className="dashboard-card-sub">
                  עבור {period ? `${formatHebrewDate(period.start)}-${formatHebrewDate(period.lastDay)}` : ""}
                </span>
              </div>
            </article>
          </div>

          {estimate ? (
            <section className="summary-block salary-breakdown">
              <h2>פירוט</h2>
              <dl>
                <div>
                  <dt>שעות רגילות (בוקר/ערב)</dt>
                  <dd>{estimate.regularHours}</dd>
                </div>
                <div>
                  <dt>
                    <Moon size={14} /> שעות לילה ({Math.round(NIGHT_PREMIUM_RATE * 100)}%)
                  </dt>
                  <dd>{estimate.nightHours}</dd>
                </div>
                <div className="salary-total">
                  <dt>ברוטו</dt>
                  <dd>{formatMoney(estimate.gross)}</dd>
                </div>
                <div>
                  <dt>מס הכנסה</dt>
                  <dd>-{formatMoney(estimate.incomeTax)}</dd>
                </div>
                <div>
                  <dt>ביטוח לאומי ומס בריאות</dt>
                  <dd>-{formatMoney(estimate.socialSecurity)}</dd>
                </div>
                <div>
                  <dt>פנסיה (6%)</dt>
                  <dd>-{formatMoney(estimate.pension)}</dd>
                </div>
                <div className="salary-total">
                  <dt>נטו משוער</dt>
                  <dd>{formatMoney(estimate.net)}</dd>
                </div>
              </dl>
              <p className="dashboard-empty-hint">
                החישוב כולל את כל המשמרות המשובצות בתקופה, גם כאלה שעוד לא עבדת. הנטו הוא הערכה
                גסה בלבד; הסכום בתלוש עשוי להיות שונה.
              </p>
            </section>
          ) : (
            <div className="dashboard-empty-card">
              <p>כדי לראות הערכת שכר, הזן/י את השכר השעתי שלך למטה.</p>
            </div>
          )}

          <form className="summary-block salary-settings" onSubmit={saveSettings}>
            <h2>הפרטים שלי</h2>
            <label>
              שכר שעתי (₪)
              <input
                type="number"
                inputMode="decimal"
                min="1"
                max="1000"
                step="0.01"
                required
                value={hourlyWage}
                onChange={(event) => setHourlyWage(event.target.value)}
              />
            </label>
            <label>
              נקודות זיכוי
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="20"
                step="0.25"
                value={taxCreditPoints}
                onChange={(event) => setTaxCreditPoints(event.target.value)}
              />
            </label>
            <button className="primary-button" type="submit" disabled={isSaving}>
              <Save size={16} />
              {isSaving ? "שומר..." : "שמירה"}
            </button>
            {message ? <p className="dashboard-empty-hint">{message}</p> : null}
            <p className="dashboard-empty-hint">
              תושב ישראל: 2.25 נקודות זיכוי, תושבת: 2.75 (ועוד נקודות לפי ילדים, תואר וכו׳). הפרטים גלויים רק לך.
            </p>
          </form>
        </>
      )}
    </AppShell>
  );
}
