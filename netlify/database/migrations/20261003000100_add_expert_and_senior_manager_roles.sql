-- Senior managers (everything, without admin-only settings) and support experts (a home
-- team, but can be scheduled into any team).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN', 'SENIOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'EXPERT', 'EMPLOYEE'));
