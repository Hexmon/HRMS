-- Expand the immutable expense command journal to every transaction-owned
-- expense mutation. This is a forward-only change; 0068 remains unchanged.
ALTER TABLE expenses.expense_command_results
  DROP CONSTRAINT IF EXISTS expense_command_results_action_check;

ALTER TABLE expenses.expense_command_results
  ALTER COLUMN ticket_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS resource_id uuid;

ALTER TABLE expenses.expense_command_results
  ADD CONSTRAINT expense_command_results_action_check
  CHECK (action IN (
    'create',
    'submit',
    'withdraw',
    'clarification',
    'manager.verify',
    'bills',
    'reviewer-routing.create',
    'reviewer-routing.revoke',
    'finance.approve',
    'finance.payment',
    'settlement'
  ));

ALTER TABLE expenses.expense_command_results
  DROP CONSTRAINT IF EXISTS expense_command_results_subject_check;

ALTER TABLE expenses.expense_command_results
  ADD CONSTRAINT expense_command_results_subject_check CHECK (
    (action IN ('reviewer-routing.create','reviewer-routing.revoke')
      AND ticket_id IS NULL AND resource_id IS NOT NULL)
    OR
    (action NOT IN ('reviewer-routing.create','reviewer-routing.revoke')
      AND ticket_id IS NOT NULL AND resource_id IS NULL)
  );
