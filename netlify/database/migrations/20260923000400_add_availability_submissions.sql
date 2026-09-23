-- Records that an employee finished filling in their availability for a week (either by
-- confirming it or by changing any of it), so the weekly reminder skips them.
CREATE TABLE IF NOT EXISTS availability_submissions (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, week_start)
);
