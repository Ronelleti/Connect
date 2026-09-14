CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('MANAGER', 'EMPLOYEE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role_title TEXT NOT NULL DEFAULT 'Employee',
  weekly_min_shifts INTEGER NOT NULL DEFAULT 1,
  weekly_max_shifts INTEGER NOT NULL DEFAULT 6,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  shift_type TEXT CHECK (shift_type IN ('MORNING', 'EVENING', 'NIGHT')),
  starts_at TIME,
  ends_at TIME,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'UNAVAILABLE' CHECK (status IN ('UNAVAILABLE', 'PREFERRED', 'TIME_OFF')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    status = 'TIME_OFF' OR shift_type IS NOT NULL OR (starts_at IS NOT NULL AND ends_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS availability_blocks_shift_unique
  ON availability_blocks (employee_id, week_start, day_index, shift_type)
  WHERE shift_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  day_index INTEGER NOT NULL CHECK (day_index BETWEEN 0 AND 6),
  shift_type TEXT NOT NULL CHECK (shift_type IN ('MORNING', 'EVENING', 'NIGHT')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, day_index, shift_type)
);

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,
  target_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  target_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,
  requester_employee_id_snapshot UUID,
  requester_employee_name_snapshot TEXT,
  target_employee_name_snapshot TEXT,
  week_start_snapshot DATE,
  day_index_snapshot INTEGER,
  shift_type_snapshot TEXT,
  target_day_index_snapshot INTEGER,
  target_shift_type_snapshot TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('PENDING_EMPLOYEE', 'DECLINED_BY_EMPLOYEE', 'PENDING_MANAGER', 'DECLINED_BY_MANAGER', 'SUPERSEDED', 'APPROVED')
  ) DEFAULT 'PENDING_EMPLOYEE',
  employee_decided_at TIMESTAMPTZ,
  manager_decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE shift_swap_requests
  DROP CONSTRAINT IF EXISTS shift_swap_requests_status_check;
ALTER TABLE shift_swap_requests
  ADD CONSTRAINT shift_swap_requests_status_check
  CHECK (status IN ('PENDING_EMPLOYEE', 'DECLINED_BY_EMPLOYEE', 'PENDING_MANAGER', 'DECLINED_BY_MANAGER', 'SUPERSEDED', 'APPROVED'));

WITH ranked_active_swaps AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY requester_assignment_id
           ORDER BY
             (CASE WHEN employee_decided_at IS NOT NULL THEN 1 ELSE 0 END +
              CASE WHEN manager_decided_at IS NOT NULL THEN 1 ELSE 0 END) DESC,
             created_at DESC,
             id DESC
         ) AS position
  FROM shift_swap_requests
  WHERE requester_assignment_id IS NOT NULL
    AND status IN ('PENDING_EMPLOYEE', 'PENDING_MANAGER')
)
UPDATE shift_swap_requests swaps
SET status = 'SUPERSEDED'
FROM ranked_active_swaps ranked
WHERE swaps.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS shift_swap_requests_active_assignment_unique
  ON shift_swap_requests (requester_assignment_id)
  WHERE status IN ('PENDING_EMPLOYEE', 'PENDING_MANAGER');

-- Existing installations need their original Sunday-Thursday constraints widened.
ALTER TABLE availability_blocks
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'UNAVAILABLE';
ALTER TABLE availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_status_check;
ALTER TABLE availability_blocks
  ADD CONSTRAINT availability_blocks_status_check
  CHECK (status IN ('UNAVAILABLE', 'PREFERRED', 'TIME_OFF'));
ALTER TABLE availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_check;
ALTER TABLE availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_window_check;
ALTER TABLE availability_blocks
  ADD CONSTRAINT availability_blocks_window_check
  CHECK (status = 'TIME_OFF' OR shift_type IS NOT NULL OR (starts_at IS NOT NULL AND ends_at IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS availability_blocks_time_off_unique
  ON availability_blocks (employee_id, week_start, day_index)
  WHERE status = 'TIME_OFF';

ALTER TABLE availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_day_index_check;
ALTER TABLE availability_blocks
  ADD CONSTRAINT availability_blocks_day_index_check CHECK (day_index BETWEEN 0 AND 6);

ALTER TABLE shift_assignments
  DROP CONSTRAINT IF EXISTS shift_assignments_day_index_check;
ALTER TABLE shift_assignments
  ADD CONSTRAINT shift_assignments_day_index_check CHECK (day_index BETWEEN 0 AND 6);

UPDATE employees SET weekly_max_shifts = 6 WHERE weekly_max_shifts <> 6;
