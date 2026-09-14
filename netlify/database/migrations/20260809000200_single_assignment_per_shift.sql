CREATE UNIQUE INDEX IF NOT EXISTS shift_assignments_cell_unique
  ON shift_assignments (week_start, day_index, shift_type);

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shift_swap_requests
  ADD COLUMN IF NOT EXISTS requester_employee_id_snapshot UUID,
  ADD COLUMN IF NOT EXISTS requester_employee_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS target_employee_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS week_start_snapshot DATE,
  ADD COLUMN IF NOT EXISTS day_index_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS shift_type_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS target_day_index_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS target_shift_type_snapshot TEXT;

UPDATE shift_swap_requests swaps
SET requester_employee_id_snapshot = requester_assignment.employee_id,
    requester_employee_name_snapshot = requester.name,
    target_employee_name_snapshot = target.name,
    week_start_snapshot = requester_assignment.week_start,
    day_index_snapshot = requester_assignment.day_index,
    shift_type_snapshot = requester_assignment.shift_type
FROM shift_assignments requester_assignment,
     employees requester,
     employees target
WHERE requester_assignment.id = swaps.requester_assignment_id
  AND requester.id = requester_assignment.employee_id
  AND target.id = swaps.target_employee_id
  AND swaps.requester_employee_id_snapshot IS NULL;

UPDATE shift_swap_requests swaps
SET target_day_index_snapshot = target_assignment.day_index,
    target_shift_type_snapshot = target_assignment.shift_type
FROM shift_assignments target_assignment
WHERE target_assignment.id = swaps.target_assignment_id
  AND swaps.target_day_index_snapshot IS NULL;

ALTER TABLE shift_swap_requests
  ALTER COLUMN requester_assignment_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS shift_swap_requests_requester_assignment_id_fkey,
  ADD CONSTRAINT shift_swap_requests_requester_assignment_id_fkey
    FOREIGN KEY (requester_assignment_id) REFERENCES shift_assignments(id) ON DELETE SET NULL,
  DROP CONSTRAINT IF EXISTS shift_swap_requests_target_assignment_id_fkey,
  ADD CONSTRAINT shift_swap_requests_target_assignment_id_fkey
    FOREIGN KEY (target_assignment_id) REFERENCES shift_assignments(id) ON DELETE SET NULL;
