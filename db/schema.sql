-- Wecom Support & Sales: shift scheduling for departments split into teams, where each
-- team defines its own shifts and how many people each one needs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- color_slot picks the team's fixed color (1-8) so it keeps the same color in every chart.
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color_slot INTEGER NOT NULL DEFAULT 1 CHECK (color_slot BETWEEN 1 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);

-- Everyone who signs in. A department manager belongs to a department; team leads and
-- employees also belong to a team. Weekly hour limits guide scheduling.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'EMPLOYEE'
    CHECK (role IN ('ADMIN', 'SENIOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'EXPERT', 'EMPLOYEE')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  weekly_min_hours INTEGER NOT NULL DEFAULT 0 CHECK (weekly_min_hours >= 0),
  weekly_max_hours INTEGER NOT NULL DEFAULT 45 CHECK (weekly_max_hours > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_team_idx ON users (team_id);
CREATE INDEX IF NOT EXISTS users_department_idx ON users (department_id);

-- Extra permissions an admin switches on for one person, on top of their role's defaults.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN (
    'schedule.edit', 'schedule.publish', 'requests.approve', 'reports.view',
    'shifts.configure', 'people.manage', 'department.view'
  )),
  PRIMARY KEY (user_id, permission)
);

-- A team's shift types. ends_at earlier than starts_at means the shift ends the next day.
-- weekdays is a bit mask: bit 0 = Sunday ... bit 6 = Saturday. Shifts are archived
-- (is_active = false) rather than deleted, so past schedules keep their shift.
CREATE TABLE IF NOT EXISTS shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  required_count INTEGER NOT NULL DEFAULT 1 CHECK (required_count BETWEEN 0 AND 200),
  weekdays INTEGER NOT NULL DEFAULT 127 CHECK (weekdays BETWEEN 0 AND 127),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (starts_at <> ends_at)
);

CREATE INDEX IF NOT EXISTS shift_templates_team_idx ON shift_templates (team_id, sort_order);

-- One person on one shift on one date. Many people can share a shift. The times are
-- copied from the shift when assigned, so editing a shift later doesn't rewrite history.
CREATE TABLE IF NOT EXISTS shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_template_id UUID NOT NULL REFERENCES shift_templates(id) ON DELETE RESTRICT,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, work_date, shift_template_id)
);

CREATE INDEX IF NOT EXISTS shift_assignments_team_date_idx ON shift_assignments (team_id, work_date);
CREATE INDEX IF NOT EXISTS shift_assignments_user_date_idx ON shift_assignments (user_id, work_date);

-- Availability for one date: for one shift (shift_template_id set) or the whole day.
CREATE TABLE IF NOT EXISTS availability_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  shift_template_id UUID REFERENCES shift_templates(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('UNAVAILABLE', 'PREFERRED', 'TIME_OFF')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'TIME_OFF' OR shift_template_id IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS availability_entries_shift_unique
  ON availability_entries (user_id, work_date, shift_template_id)
  WHERE shift_template_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS availability_entries_day_unique
  ON availability_entries (user_id, work_date)
  WHERE shift_template_id IS NULL;

-- Someone finished filling in a week (so the Sunday reminder skips them).
CREATE TABLE IF NOT EXISTS availability_submissions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);

-- Swap requests: the requester hands over one of their shifts to a colleague, optionally
-- taking one of the colleague's shifts in return. The colleague accepts, then someone who
-- can approve requests for that team approves. Snapshots keep the history readable.
CREATE TABLE IF NOT EXISTS swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,
  target_assignment_id UUID REFERENCES shift_assignments(id) ON DELETE SET NULL,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  shift_label TEXT NOT NULL,
  target_shift_label TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_EMPLOYEE' CHECK (status IN (
    'PENDING_EMPLOYEE', 'DECLINED_BY_EMPLOYEE', 'PENDING_MANAGER', 'DECLINED_BY_MANAGER',
    'CANCELLED', 'APPROVED'
  )),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  employee_decided_at TIMESTAMPTZ,
  manager_decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS swap_requests_one_active_per_assignment
  ON swap_requests (requester_assignment_id)
  WHERE status IN ('PENDING_EMPLOYEE', 'PENDING_MANAGER');

-- Giveaway board: someone offers a shift to their team, a teammate takes it, and someone
-- who can approve requests for that team approves the handover.
CREATE TABLE IF NOT EXISTS shift_giveaways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  offered_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taken_by UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (
    status IN ('OPEN', 'PENDING_MANAGER', 'APPROVED', 'DECLINED_BY_MANAGER', 'CANCELLED')
  ),
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  taken_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS shift_giveaways_one_active_per_assignment
  ON shift_giveaways (assignment_id)
  WHERE status IN ('OPEN', 'PENDING_MANAGER');

-- Vacation requests: approval marks the days as time off and removes the person's shifts.
CREATE TABLE IF NOT EXISTS vacation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED')),
  removed_shift_count INTEGER NOT NULL DEFAULT 0,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS vacation_requests_user_idx ON vacation_requests (user_id, start_date);

-- A team's week that was published: its members were notified with their shifts.
CREATE TABLE IF NOT EXISTS published_weeks (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (team_id, week_start)
);

CREATE TABLE IF NOT EXISTS auth_login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In-app notifications (the bell) and the Web Push subscriptions used to deliver them
-- to installed phone apps.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shared_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- Senior managers (everything, without admin-only settings) and support experts (a home
-- team, but can be scheduled into any team).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN', 'SENIOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'EXPERT', 'EMPLOYEE'));
