import type { QueryResultRow } from "pg";
import { Roles } from "#shared";

interface SeedSqlClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}

export interface ReleasePersonaIdentity {
  userId: string;
  employeeCode: string;
  email: string;
}

export async function verifyReleasePersonaIdentity(
  client: SeedSqlClient,
  expected: ReleasePersonaIdentity,
): Promise<void> {
  const result = await client.query<{
    id: string;
    employee_code: string;
    email: string;
  }>(
    `SELECT id, employee_code, email
       FROM core.users
      WHERE id = $1
         OR employee_code = $2
         OR lower(email) = lower($3)
      FOR UPDATE`,
    [expected.userId, expected.employeeCode, expected.email],
  );
  const exact = result.rows.filter(
    (row) =>
      row.id === expected.userId &&
      row.employee_code === expected.employeeCode &&
      row.email.toLowerCase() === expected.email.toLowerCase(),
  );
  if (result.rows.length !== 1 || exact.length !== 1) {
    throw new Error(
      `Release seed refused an identity collision for ${expected.employeeCode}.`,
    );
  }
}

export async function ensureReleaseBuiltinRoles(
  client: SeedSqlClient,
): Promise<void> {
  for (const roleKey of Object.values(Roles)) {
    await client.query(
      `INSERT INTO core.roles (role_key, name, description, status, builtin)
       VALUES ($1, $1, '', 'active', true)
       ON CONFLICT (role_key) DO NOTHING`,
      [roleKey],
    );
    const verified = await client.query<{
      role_key: string;
      status: string;
      builtin: boolean;
      deleted_at: string | null;
    }>(
      `SELECT role_key, status, builtin, deleted_at
         FROM core.roles
        WHERE role_key = $1
        FOR UPDATE`,
      [roleKey],
    );
    const role = verified.rows[0];
    if (
      verified.rows.length !== 1 ||
      !role ||
      role.role_key !== roleKey ||
      role.status !== "active" ||
      role.builtin !== true ||
      role.deleted_at !== null
    ) {
      throw new Error(
        `Release seed refused an inactive, deleted, or non-builtin role collision for ${roleKey}.`,
      );
    }
  }
}
