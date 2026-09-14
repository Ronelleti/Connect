"use client";

import { RotateCcw, TimerReset } from "lucide-react";

export function AssignmentUndoToast({
  employeeName,
  secondsLeft,
  durationMs,
  onUndo
}: {
  employeeName: string;
  secondsLeft: number;
  durationMs: number;
  onUndo: () => void;
}) {
  return (
    <section className="undo-toast" role="status" aria-live="polite">
      <div className="undo-toast-icon"><TimerReset size={20} /></div>
      <div className="undo-toast-copy">
        <strong>השיבוץ של {employeeName} הוסר</strong>
        <span>המחיקה תישמר בעוד {secondsLeft} שניות</span>
      </div>
      <button type="button" onClick={onUndo}>
        <RotateCcw size={16} />
        ביטול המחיקה
      </button>
      <i style={{ animationDuration: `${durationMs}ms` }} aria-hidden="true" />
    </section>
  );
}
