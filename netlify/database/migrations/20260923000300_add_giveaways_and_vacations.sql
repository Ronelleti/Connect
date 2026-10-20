-- Shift giveaway board: an employee offers one of their shifts, another employee takes
-- it, and a manager approves the handover.
CREATE TABLE IF NOT EXISTS shift_giveaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  offered_by_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  taken_by_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (
    status IN ('OPEN', 'PENDING_MANAGER', 'APPROVED', 'DECLINED_BY_MANAGER', 'CANCELLED')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  taken_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS shift_giveaways_one_active_per_assignment
  ON shift_giveaways (assignment_id)
  WHERE status IN ('OPEN', 'PENDING_MANAGER');

-- Vacation requests: approved requests become full-day vacation (TIME_OFF) availability
-- and remove the employee's shifts on those days.
CREATE TABLE IF NOT EXISTS vacation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED')
  ),
  removed_shift_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS vacation_requests_employee_idx
  ON vacation_requests (employee_id, start_date);
