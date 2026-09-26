-- Weeks a manager published: every employee was notified that the week's schedule is
-- ready. Publishing again updates the time and sends an "updated schedule" notification.
CREATE TABLE IF NOT EXISTS published_weeks (
  week_start DATE PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES users(id) ON DELETE SET NULL
);
