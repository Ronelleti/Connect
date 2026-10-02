"use client";

import { AlertTriangle, CalendarRange, Clock3, Inbox, Palmtree, Search, ShieldCheck, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { addDays, formatHebrewDate } from "@/lib/dates";
import type { Insights } from "@/lib/insights";
import { DAY_LABELS } from "@/lib/labels";
import { formatHours } from "@/lib/shiftTime";
import type { Team } from "@/lib/types";
import { DayColumns, HBars, hoursLabel } from "../charts/Bars";
import { ChartCard } from "../charts/ChartCard";
import { HourlyHeatmap, HourlyTable } from "../charts/Heatmap";
import { Meter, Sparkline, StatTile } from "../charts/StatTile";
import { AppShell, type ShellProps } from "../shell/AppShell";
import { TeamDot } from "../ui/Avatar";
import { WeekNav } from "../ui/WeekNav";

type InsightsData = Insights & {
  weekStart: string;
  reportTeams: Team[];
  selectedTeamIds: string[];
  pending: { swaps: number; giveaways: number; vacations: number };
};

export function InsightsView({ thisWeek, ...shell }: ShellProps & { thisWeek: string }) {
  const [weekStart, setWeekStart] = useState(thisWeek);
  const [team, setTeam] = useState("all");
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api<InsightsData>(`/api/insights?week=${weekStart}&team=${team}`);
    setLoading(false);
    if (result.ok) {
      setData(result.data);
    }
  }, [weekStart, team]);

  useEffect(() => {
    // Fetching on filter change is intentionally synchronized here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const teams = data?.reportTeams ?? [];
  const teamById = new Map(teams.map((item) => [item.id, item]));
  const pendingTotal = data ? data.pending.swaps + data.pending.giveaways + data.pending.vacations : 0;
  const people = (data?.people ?? []).filter((person) => person.name.includes(search.trim()));
  // Status color only when coverage is actually a problem; otherwise the plain accent.
  const coverageTone = (percent: number) => (percent >= 95 ? undefined : percent >= 85 ? "warning" : "critical");

  return (
    <AppShell {...shell} title="תובנות" subtitle="איוש, עומסים ושעות">
      <div className="toolbar" role="group" aria-label="סינון">
        <select value={team} onChange={(event) => setTeam(event.target.value)} aria-label="צוות" style={{ width: "auto", minWidth: 200 }}>
          {teams.length > 1 ? <option value="all">כל הצוותים ({teams.length})</option> : null}
          {teams.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <WeekNav weekStart={weekStart} onChange={setWeekStart} thisWeek={thisWeek} />
      </div>

      {!data ? (
        <p className="empty-state">{loading ? "טוען..." : "אין נתונים."}</p>
      ) : (
        <div style={{ display: "grid", gap: 20, opacity: loading ? 0.6 : 1, transition: "opacity 120ms" }}>
          <div className="kpi-row">
            <StatTile
              label="איוש השבוע"
              value={`${data.kpis.coveragePercent}%`}
              icon={<ShieldCheck size={15} />}
              sub={`${data.kpis.filled}/${data.kpis.required} מקומות · מגמה ${data.trend.length} שבועות`}
            >
              <Sparkline values={data.trend.map((point) => point.percent)} label={`איוש ב-${data.trend.length} השבועות האחרונים: ${data.trend.map((point) => `${point.percent}%`).join(", ")}`} />
            </StatTile>
            <StatTile
              label="מקומות פתוחים"
              value={data.kpis.openSlots}
              icon={<AlertTriangle size={15} />}
              sub={data.kpis.understaffedShifts > 0 ? `ב-${data.kpis.understaffedShifts} משמרות` : "כל המשמרות מאוישות"}
            />
            <StatTile label="שעות עבודה" value={formatHours(data.kpis.totalHours)} icon={<Clock3 size={15} />} sub={`${data.kpis.scheduledPeople} אנשים משובצים`} />
            <StatTile
              label="בחופש השבוע"
              value={data.kpis.timeOffPeople}
              unit="אנשים"
              icon={<Palmtree size={15} />}
              sub={data.peopleOutsideLimits > 0 ? `${data.peopleOutsideLimits} מחוץ לטווח השעות שלהם` : "כולם בטווח השעות"}
            />
            <StatTile
              label="ממתין לאישור"
              value={pendingTotal}
              icon={<Inbox size={15} />}
              sub={`${data.pending.swaps} החלפות · ${data.pending.giveaways} מסירות · ${data.pending.vacations} חופשות`}
            />
          </div>

          <div className="grid-2">
            <ChartCard
              title="איוש לפי צוות"
              subtitle="אחוז המקומות הנדרשים שאוישו השבוע"
              table={
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>צוות</th>
                      <th>אחוז איוש</th>
                      <th>מאוישים</th>
                      <th>נדרשים</th>
                      <th>שעות</th>
                      <th>אנשים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teams.map((row) => (
                      <tr key={row.teamId}>
                        <td>{row.name}</td>
                        <td className="num">{row.percent}%</td>
                        <td className="num">{row.filled}</td>
                        <td className="num">{row.required}</td>
                        <td className="num">{formatHours(row.hours)}</td>
                        <td className="num">{row.people}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <HBars
                label="איוש לפי צוות"
                scaleMax={100}
                rows={data.teams.map((row) => ({
                  key: row.teamId,
                  label: row.name,
                  value: row.percent,
                  valueLabel: `${row.percent}%`,
                  colorSlot: row.colorSlot,
                  leading: <TeamDot colorSlot={row.colorSlot} />,
                  tooltip: (
                    <>
                      <strong>{row.percent}%</strong>
                      <span>
                        {row.name} · {row.filled}/{row.required} מקומות
                      </span>
                      <span>
                        {formatHours(row.hours)} שעות · {row.people} אנשים
                      </span>
                    </>
                  )
                }))}
              />
              {data.teams.some((row) => row.openSlots > 0) ? (
                <p className="hint" style={{ marginTop: 12 }}>
                  {data.teams
                    .filter((row) => row.openSlots > 0)
                    .map((row) => `${row.name}: ${row.openSlots} פתוחים`)
                    .join(" · ")}
                </p>
              ) : null}
            </ChartCard>

            <ChartCard
              title="איוש לפי יום"
              subtitle="מאוישים מול נדרשים בכל יום בשבוע"
              table={
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>יום</th>
                      <th>מאוישים</th>
                      <th>נדרשים</th>
                      <th>פתוחים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((day, index) => (
                      <tr key={day.date}>
                        <td>
                          {DAY_LABELS[index]} {formatHebrewDate(day.date)}
                        </td>
                        <td className="num">{day.filled}</td>
                        <td className="num">{day.required}</td>
                        <td className="num">{day.open}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            >
              <DayColumns
                days={data.daily.map((day, index) => ({ label: DAY_LABELS[index], sub: formatHebrewDate(day.date), required: day.required, filled: day.filled }))}
              />
            </ChartCard>
          </div>

          <ChartCard
            title="עומס לפי שעה"
            subtitle={`כמה אנשים עובדים בכל שעה · ${formatHebrewDate(weekStart)}–${formatHebrewDate(addDays(weekStart, 6))}`}
            table={<HourlyTable data={data.hourly} />}
          >
            <HourlyHeatmap data={data.hourly} />
          </ChartCard>

          <ChartCard
            title="שעות לפי עובד/ת"
            subtitle="הקו האנכי מסמן את מקסימום השעות השבועי של כל אחד"
            actions={
              <label className="search-input" style={{ display: "block", minWidth: 180 }}>
                <span className="sr-only">חיפוש</span>
                <Search size={16} aria-hidden="true" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש" />
              </label>
            }
            table={
              <table className="data-table">
                <thead>
                  <tr>
                    <th>שם</th>
                    <th>צוות</th>
                    <th>שעות</th>
                    <th>משמרות</th>
                    <th>מינימום</th>
                    <th>מקסימום</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.userId}>
                      <td>{person.name}</td>
                      <td>{teamById.get(person.teamId ?? "")?.name ?? ""}</td>
                      <td className="num">{formatHours(person.hours)}</td>
                      <td className="num">{person.shifts}</td>
                      <td className="num">{person.minHours}</td>
                      <td className="num">{person.maxHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          >
            <div className="hbar-scroll">
              <HBars
                label="שעות לפי עובד/ת"
                scaleMax={Math.max(...people.map((person) => person.maxHours), 1)}
                rows={people.map((person) => {
                  const teamInfo = teamById.get(person.teamId ?? "");
                  const outside = person.hours > person.maxHours ? "מעל המקסימום" : person.hours < person.minHours ? "מתחת למינימום" : null;
                  return {
                    key: person.userId,
                    label: person.name,
                    value: person.hours,
                    valueLabel: hoursLabel(person.hours),
                    marker: person.maxHours,
                    colorSlot: data.selectedTeamIds.length > 1 ? teamInfo?.colorSlot : null,
                    leading: data.selectedTeamIds.length > 1 && teamInfo ? <TeamDot colorSlot={teamInfo.colorSlot} /> : null,
                    tooltip: (
                      <>
                        <strong>{hoursLabel(person.hours)}</strong>
                        <span>
                          {person.name}
                          {teamInfo ? ` · ${teamInfo.name}` : ""}
                        </span>
                        <span>
                          {person.shifts} משמרות · טווח {person.minHours}–{person.maxHours}
                          {outside ? ` · ${outside}` : ""}
                        </span>
                      </>
                    )
                  };
                })}
              />
            </div>
            {data.selectedTeamIds.length > 1 ? (
              <div className="chart-legend" aria-label="מקרא צוותים">
                {teams
                  .filter((item) => data.selectedTeamIds.includes(item.id))
                  .map((item) => (
                    <span key={item.id}>
                      <TeamDot colorSlot={item.colorSlot} />
                      {item.name}
                    </span>
                  ))}
              </div>
            ) : null}
          </ChartCard>

          <section className="card" aria-label="מגמת איוש">
            <div className="card-header">
              <div>
                <h2>מגמת איוש</h2>
                <p>אחוז האיוש בשבועות האחרונים</p>
              </div>
              <CalendarRange size={18} className="muted" aria-hidden="true" />
            </div>
            <div className="hbars">
              {data.trend.map((point) => (
                <div key={point.weekStart} className="hbar-row" style={{ gridTemplateColumns: "minmax(90px, 160px) minmax(0, 1fr) 56px" }}>
                  <span className="hbar-name">
                    <span>
                      {formatHebrewDate(point.weekStart)}–{formatHebrewDate(addDays(point.weekStart, 6))}
                    </span>
                  </span>
                  <Meter value={point.percent} max={100} tone={coverageTone(point.percent)} label={`${point.percent}%`} />
                  <span className="hbar-value">{point.percent}%</span>
                </div>
              ))}
            </div>
          </section>
          <p className="hint">
            <Users size={12} aria-hidden="true" /> הנתונים כוללים רק צוותים שיש לך הרשאת צפייה בנתונים שלהם.
          </p>
        </div>
      )}
    </AppShell>
  );
}
