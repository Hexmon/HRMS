import type { PoolClient } from "pg";
import type { UUID } from "#shared";

export const expenseFinanceGovernanceRoutingLockKey =
  "expense-routing:finance-governance:v1";

export function expenseReviewerRoutingLockKey(requesterUserId: UUID): string {
  return `expense-routing:reviewer:${requesterUserId}:v1`;
}

async function lockKey(
  client: PoolClient,
  key: string,
  mode: "shared" | "exclusive",
): Promise<void> {
  await client.query(
    mode === "shared"
      ? "SELECT pg_advisory_xact_lock_shared(hashtextextended($1::text, 0))"
      : "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
    [key],
  );
}

function sortedRequesterIds(requesterUserIds: readonly UUID[]): UUID[] {
  return [...new Set(requesterUserIds)].sort();
}

export async function lockExpenseRoutingReader(
  client: PoolClient,
  requesterUserIds: readonly UUID[],
): Promise<void> {
  await lockKey(client, expenseFinanceGovernanceRoutingLockKey, "shared");
  for (const requesterUserId of sortedRequesterIds(requesterUserIds)) {
    await lockKey(
      client,
      expenseReviewerRoutingLockKey(requesterUserId),
      "shared",
    );
  }
}

export async function lockExpenseFinanceGovernanceWriter(
  client: PoolClient,
): Promise<void> {
  await lockKey(client, expenseFinanceGovernanceRoutingLockKey, "exclusive");
}

/**
 * Mapping writers share the governance lock so unrelated requesters remain
 * concurrent, then exclusively lock affected requester keys in sorted order.
 */
export async function lockExpenseReviewerRoutingWriter(
  client: PoolClient,
  requesterUserIds: readonly UUID[],
): Promise<void> {
  await lockKey(client, expenseFinanceGovernanceRoutingLockKey, "shared");
  for (const requesterUserId of sortedRequesterIds(requesterUserIds)) {
    await lockKey(
      client,
      expenseReviewerRoutingLockKey(requesterUserId),
      "exclusive",
    );
  }
}

/** Combined governance + mapping writers, such as initial seed, hold every
 * exclusive lock in the canonical global-then-requester order until commit. */
export async function lockExpenseCombinedRoutingWriter(
  client: PoolClient,
  requesterUserIds: readonly UUID[],
): Promise<void> {
  await lockExpenseFinanceGovernanceWriter(client);
  for (const requesterUserId of sortedRequesterIds(requesterUserIds)) {
    await lockKey(
      client,
      expenseReviewerRoutingLockKey(requesterUserId),
      "exclusive",
    );
  }
}
