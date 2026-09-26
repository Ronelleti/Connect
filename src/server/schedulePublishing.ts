import { buildSchedulePublishedMessage } from "@/lib/schedulePublish";
import { query } from "./db";
import { notifyUsers } from "./notifications";
import { listAssignments, listEmployees } from "./repositories";

export async function getWeekPublishedAt(weekStart: string) {
  const [row] = await query<{ published_at: string | Date }>(
    "SELECT published_at FROM published_weeks WHERE week_start = $1",
    [weekStart]
  );
  return row ? new Date(row.published_at).toISOString() : null;
}

// Marks the week as published and tells every active employee who can sign in which
// shifts they got. Returns whether it had been published before and how many were told.
export async function publishWeek(weekStart: string, publishedBy: string) {
  const [row] = await query<{ published_at: string | Date; was_published: boolean }>(
    `WITH previous AS (SELECT 1 FROM published_weeks WHERE week_start = $1)
     INSERT INTO published_weeks (week_start, published_at, published_by)
     VALUES ($1, now(), $2)
     ON CONFLICT (week_start) DO UPDATE SET
       published_at = EXCLUDED.published_at,
       published_by = EXCLUDED.published_by
     RETURNING published_at, EXISTS (SELECT 1 FROM previous) AS was_published`,
    [weekStart, publishedBy]
  );

  const [employees, assignments] = await Promise.all([listEmployees(), listAssignments(weekStart)]);
  const recipients = employees.filter((employee) => employee.userId);
  await Promise.all(
    recipients.map((employee) =>
      notifyUsers(
        [employee.userId],
        buildSchedulePublishedMessage(
          weekStart,
          assignments.filter((assignment) => assignment.employeeId === employee.id),
          row.was_published
        )
      )
    )
  );

  return {
    publishedAt: new Date(row.published_at).toISOString(),
    wasPublished: row.was_published,
    notified: recipients.length
  };
}
