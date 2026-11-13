-- Expand the immutable expense command journal to every transaction-owned
-- expense mutation. This is a forward-only change; 0068 remains unchanged.
ALTER TABLE expenses.expense_command_results
  DROP CONSTRAINT IF EXISTS expense_command_results_action_check;

ALTER TABLE expenses.expense_command_results
  ADD CONSTRAINT expense_command_results_action_check
  CHECK (action IN (
    'create',
    'submit',
    'withdraw',
    'clarification',
    'manager.verify',
    'bills',
    'finance.approve',
    'finance.payment',
    'settlement'
  ));
