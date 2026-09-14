ALTER TABLE shift_swap_requests
  DROP CONSTRAINT IF EXISTS shift_swap_requests_status_check;

ALTER TABLE shift_swap_requests
  ADD CONSTRAINT shift_swap_requests_status_check
  CHECK (status IN (
    'PENDING_EMPLOYEE',
    'DECLINED_BY_EMPLOYEE',
    'PENDING_MANAGER',
    'DECLINED_BY_MANAGER',
    'SUPERSEDED',
    'APPROVED'
  ));

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
