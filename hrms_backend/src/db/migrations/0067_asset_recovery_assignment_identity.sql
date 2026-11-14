-- Recovery settlement must refer to the exact custody assignment that
-- existed when the ticket was opened. Legacy tickets without a provably
-- unique assignment stay unbound and fail closed until HR reviews them.
ALTER TABLE assets.asset_recovery_tickets
  ADD COLUMN IF NOT EXISTS assignment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'asset_recovery_tickets_assignment_id_fkey'
      AND conrelid = 'assets.asset_recovery_tickets'::regclass
  ) THEN
    ALTER TABLE assets.asset_recovery_tickets
      ADD CONSTRAINT asset_recovery_tickets_assignment_id_fkey
      FOREIGN KEY (assignment_id) REFERENCES assets.asset_assignments(id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS asset_recovery_tickets_assignment_idx
  ON assets.asset_recovery_tickets (assignment_id);

-- The migration runner wraps each file in a transaction. This marker is
-- local to that transaction and does not grant the runtime session a bypass.
SET LOCAL hrms.asset_writer_v2 = 'on';

WITH unique_matches AS (
  SELECT ticket.id AS ticket_id, min(assignment.id::text)::uuid AS assignment_id
  FROM assets.asset_recovery_tickets AS ticket
  JOIN assets.asset_assignments AS assignment
    ON assignment.asset_id = ticket.asset_id
   AND assignment.assigned_to_user_id = ticket.employee_user_id
   AND assignment.assigned_at <= ticket.created_at
   AND (assignment.returned_at IS NULL OR assignment.returned_at >= ticket.created_at)
  GROUP BY ticket.id
  HAVING count(*) = 1
)
UPDATE assets.asset_recovery_tickets AS ticket
SET assignment_id = unique_matches.assignment_id
FROM unique_matches
WHERE ticket.id = unique_matches.ticket_id;
