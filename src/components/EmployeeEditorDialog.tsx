"use client";

import { Save, X } from "lucide-react";
import type { Employee } from "@/lib/types";

export type EmployeeEditor =
  | { mode: "create"; employee: null }
  | { mode: "edit"; employee: Employee };

export function EmployeeEditorDialog({
  editor,
  isSaving,
  onClose,
  onSubmit
}: {
  editor: EmployeeEditor;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const employee = editor.employee;
  const isCreate = editor.mode === "create";

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="employee-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-editor-title"
      >
        <div className="dialog-title">
          <div>
            <h2 id="employee-editor-title">{isCreate ? "הוספת עובד" : "עריכת עובד"}</h2>
            <p>{isCreate ? "יצירת חשבון חדש ושיוכו לסידור העבודה" : employee?.name}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="סגירה">
            <X size={18} />
          </button>
        </div>

        <form className="employee-form" onSubmit={onSubmit}>
          <label>
            שם מלא
            <input name="name" required defaultValue={employee?.name ?? ""} />
          </label>
          <label>
            אימייל
            <input name="email" type="email" required defaultValue={employee?.email ?? ""} />
          </label>
          <label>
            תפקיד
            <input name="roleTitle" required defaultValue={employee?.roleTitle ?? "עובד/ת משמרת"} />
          </label>
          <div className="employee-limits">
            <label>
              מינימום משמרות
              <input
                name="weeklyMinShifts"
                type="number"
                min="1"
                max="6"
                required
                defaultValue={employee?.weeklyMinShifts ?? 1}
              />
            </label>
            <label>
              מקסימום משמרות
              <input
                name="weeklyMaxShifts"
                type="number"
                min="1"
                max="6"
                required
                defaultValue={employee?.weeklyMaxShifts ?? 6}
              />
            </label>
          </div>
          <label>
            {isCreate ? "סיסמה" : "סיסמה חדשה (אופציונלי)"}
            <input
              name="password"
              type="password"
              minLength={12}
              required={isCreate}
              autoComplete="new-password"
              placeholder={isCreate ? "לפחות 12 תווים" : "השאר ריק כדי לשמור את הסיסמה"}
            />
          </label>
          <div className="dialog-actions">
            <button type="button" className="soft-action" onClick={onClose} disabled={isSaving}>
              ביטול
            </button>
            <button className="primary-button" disabled={isSaving}>
              <Save size={17} />
              {isSaving ? "שומר..." : "שמירה"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
