"use client";

import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { addDays, formatHebrewDate } from "@/lib/dates";

// Lets an employee confirm they finished filling in their availability for the open week,
// which stops the weekly reminder. Changing any availability also counts as confirming.
export function AvailabilityConfirmBar() {
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/availability/submission", { cache: "no-store" });
      if (!response.ok || cancelled) {
        return;
      }
      const body = await response.json();
      if (!cancelled && body.isEmployee) {
        setWeekStart(body.weekStart);
        setSubmittedAt(body.submittedAt);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirm() {
    setIsBusy(true);
    const response = await fetch("/api/availability/submission", { method: "POST" });
    if (response.ok) {
      setSubmittedAt((await response.json()).submittedAt);
    }
    setIsBusy(false);
  }

  if (!weekStart) {
    return null;
  }
  const weekLabel = `${formatHebrewDate(weekStart)}-${formatHebrewDate(addDays(weekStart, 6))}`;

  return (
    <div className={`availability-confirm ${submittedAt ? "done" : ""}`}>
      {submittedAt ? (
        <span>
          <CheckCircle2 size={18} /> האילוצים שלך לשבוע {weekLabel} נשמרו. אפשר לעדכן עד יום שלישי.
        </span>
      ) : (
        <>
          <span>
            <ClipboardCheck size={18} /> יש למלא אילוצים לשבוע {weekLabel} עד יום שלישי. אם אין לך
            אילוצים, פשוט אשר/י.
          </span>
          <button className="primary-button" onClick={confirm} disabled={isBusy}>
            סיימתי למלא
          </button>
        </>
      )}
    </div>
  );
}
