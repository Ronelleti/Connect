"use client";

import { ArrowLeftRight, CalendarCheck2, CheckCircle2, Clock3, Gift, Inbox } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { addDays, diffDays, formatHebrewDate } from "@/lib/dates";
import { DAY_LABELS, dayLabel } from "@/lib/labels";
import { formatHours, timeRangeLabel } from "@/lib/shiftTime";
import { Meter, StatTile } from "../charts/StatTile";
import { AppShell, type ShellProps } from "../shell/AppShell";
import { Avatar } from "../ui/Avatar";

interface NamedShift {
  id: string;
  workDate: string;
  startsAt: string;
  endsAt: string;
  shiftName: string;
  teamName: string;
}

interface Dashboard {
  today: string;
  weekStart: string;
  openWeek: string;
  availabilitySubmitted: boolean;
  thisWeek: NamedShift[];
  nextShift: NamedShift | null;
  weekHours: number;
  monthHours: number;
  monthShifts: number;
  weeklyMaxHours: number;
  weeklyMinHours: number;
  swapsWaitingForMe: number;
  approvalsWaiting: number;
  openGiveaways: number;
  onShiftNow: { userId: string; name: string; startsAt: string; endsAt: string }[];
  teamPublished: boolean;
}

function relativeDay(today: string, date: string) {
  const days = diffDays(today, date);
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  return `${dayLabel(date)} ${formatHebrewDate(date)}`;
}

export function HomeView(shell: ShellProps) {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<Dashboard>("/api/dashboard").then((result) => {
      if (!cancelled && result.ok) {
        setData(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = shell.user.name.split(" ")[0];
  const actions = data
    ? [
        data.swapsWaitingForMe > 0 && {
          icon: <ArrowLeftRight size={18} />,
          title: `${data.swapsWaitingForMe} בקשות החלפה ממתינות לך`,
          sub: "עמיתים ביקשו להחליף איתך משמרת",
          href: "/requests"
        },
        data.approvalsWaiting > 0 && {
          icon: <Inbox size={18} />,
          title: `${data.approvalsWaiting} בקשות ממתינות לאישורך`,
          sub: "החלפות, מסירות וחופשות של הצוות",
          href: "/requests?tab=approvals"
        },
        shell.user.teamId && !data.availabilitySubmitted && {
          icon: <CalendarCheck2 size={18} />,
          title: `מילוי זמינות לשבוע ${formatHebrewDate(data.openWeek)}`,
          sub: "עוד לא סימנת זמינות לשבוע הפתוח",
          href: "/availability"
        },
        data.openGiveaways > 0 && {
          icon: <Gift size={18} />,
          title: `${data.openGiveaways} משמרות זמינות למסירה`,
          sub: "עמיתים מהצוות מוסרים משמרות",
          href: "/requests?tab=board"
        }
      ].filter(Boolean)
    : [];

  return (
    <AppShell {...shell} title={`שלום, ${firstName}`} subtitle={data ? `${dayLabel(data.today)} ${formatHebrewDate(data.today)}` : undefined}>
      {!data ? (
        <p className="empty-state">טוען...</p>
      ) : (
        <>
          <div className="home-hero">
            <section className="card next-shift" aria-label="המשמרת הבאה שלך">
              <div>
                <p className="eyebrow">המשמרת הבאה שלך</p>
                {data.nextShift ? (
                  <>
                    <div className="hero-figure ltr">{timeRangeLabel(data.nextShift.startsAt, data.nextShift.endsAt)}</div>
                    <p style={{ marginTop: 8 }}>
                      {relativeDay(data.today, data.nextShift.workDate)} · {data.nextShift.shiftName} · {data.nextShift.teamName}
                    </p>
                  </>
                ) : (
                  <p style={{ fontSize: 18, fontWeight: 700 }}>אין משמרות קרובות בשבועיים הקרובים.</p>
                )}
              </div>
              {shell.user.teamId && !data.teamPublished ? (
                <p style={{ fontSize: 13 }}>הסידור של השבוע עוד לא פורסם, ייתכנו שינויים.</p>
              ) : null}
            </section>

            <div className="grid-2" style={{ gap: 14 }}>
              <StatTile
                label="שעות השבוע"
                value={formatHours(data.weekHours)}
                unit={data.weeklyMaxHours ? `/ ${data.weeklyMaxHours}` : undefined}
                icon={<Clock3 size={15} />}
                sub={data.weeklyMinHours > 0 && data.weekHours < data.weeklyMinHours ? `מתחת למינימום (${data.weeklyMinHours})` : `${data.thisWeek.length} משמרות`}
              >
                {data.weeklyMaxHours > 0 ? (
                  <Meter
                    value={data.weekHours}
                    max={data.weeklyMaxHours}
                    tone={data.weekHours > data.weeklyMaxHours ? "critical" : undefined}
                    label="שעות השבוע מתוך המקסימום"
                  />
                ) : null}
              </StatTile>
              <StatTile label="החודש" value={formatHours(data.monthHours)} unit="שעות" sub={`${data.monthShifts} משמרות`} icon={<CalendarCheck2 size={15} />} />
            </div>
          </div>

          <section className="card" aria-label="השבוע שלי">
            <div className="card-header">
              <div>
                <h2>השבוע שלי</h2>
                <p>
                  {formatHebrewDate(data.weekStart)}–{formatHebrewDate(addDays(data.weekStart, 6))}
                </p>
              </div>
              <Link href="/schedule" className="secondary-button small">
                לסידור המלא
              </Link>
            </div>
            <div className="week-strip">
              {DAY_LABELS.map((label, index) => {
                const date = addDays(data.weekStart, index);
                const shifts = data.thisWeek.filter((shift) => shift.workDate === date);
                return (
                  <div key={date} className={`week-day ${date === data.today ? "today" : ""}`}>
                    <header>
                      {label}
                      <span>{formatHebrewDate(date)}</span>
                    </header>
                    {shifts.length === 0 ? (
                      <span className="off">חופשי</span>
                    ) : (
                      shifts.map((shift) => (
                        <div key={shift.id} className="shift-chip">
                          {shift.shiftName}
                          <span className="ltr">{timeRangeLabel(shift.startsAt, shift.endsAt)}</span>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid-2">
            <section className="card" aria-label="מה מחכה לך">
              <div className="card-header">
                <h2>מה מחכה לך</h2>
              </div>
              {actions.length === 0 ? (
                <div className="action-item">
                  <span className="status-icon good" aria-hidden="true">
                    <CheckCircle2 size={12} />
                  </span>
                  <div>
                    <strong>הכול מעודכן</strong>
                    <span>אין בקשות או משימות פתוחות.</span>
                  </div>
                </div>
              ) : (
                <div className="action-list">
                  {actions.map((action) =>
                    action ? (
                      <Link key={action.href + action.title} href={action.href} className="action-item">
                        <span className="action-icon">{action.icon}</span>
                        <div>
                          <strong>{action.title}</strong>
                          <span>{action.sub}</span>
                        </div>
                      </Link>
                    ) : null
                  )}
                </div>
              )}
            </section>

            {shell.user.teamId ? (
              <section className="card" aria-label="עכשיו במשמרת">
                <div className="card-header">
                  <div>
                    <h2>עכשיו במשמרת</h2>
                    <p>{shell.teamName}</p>
                  </div>
                  <span className="badge accent">{data.onShiftNow.length}</span>
                </div>
                {data.onShiftNow.length === 0 ? (
                  <p className="empty-state" style={{ padding: 12 }}>
                    אף אחד מהצוות לא במשמרת כרגע.
                  </p>
                ) : (
                  <ul className="plain-list on-shift-list">
                    {data.onShiftNow.map((person) => (
                      <li key={person.userId}>
                        <Avatar name={person.name} colorSlot={shell.teamColorSlot} size="sm" />
                        <span style={{ flex: 1 }}>{person.name}</span>
                        <span className="muted ltr tabular">{timeRangeLabel(person.startsAt, person.endsAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        </>
      )}
    </AppShell>
  );
}
