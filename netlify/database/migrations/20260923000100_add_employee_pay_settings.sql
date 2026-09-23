-- Each employee sets their own hourly wage for the salary estimate. Kept out of the
-- employees table so it is never exposed through the manager-facing employee APIs.
CREATE TABLE IF NOT EXISTS employee_pay_settings (
  employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  hourly_wage NUMERIC(10, 2) NOT NULL CHECK (hourly_wage > 0),
  tax_credit_points NUMERIC(5, 2) NOT NULL DEFAULT 2.25 CHECK (tax_credit_points >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
