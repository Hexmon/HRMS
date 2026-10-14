import { read, walkFiles, fail } from "./lib.js";
import { loadEnvFile, requireEnv } from "./env.js";
import { Client } from "pg";

const sqlFiles = walkFiles("src/db/migrations", (path) => path.endsWith(".sql"));
const replacementMigration = "src/db/migrations/0063_cross_schema_reference_integrity.sql";

type CrossSchemaForeignKey = {
  file: string;
  table: string;
  foreignTable: string;
};

const replacementConstraints = new Map<
  string,
  { constraint: string; childTrigger: string; parentTrigger: string }
>([
  ["core.departments->platform.company_profiles", { constraint: "departments_company_id_fkey", childTrigger: "core_cross_schema_company_reference_trg", parentTrigger: "platform_company_profile_attendance_reference_restrict_trg" }],
  ["core.designations->platform.company_profiles", { constraint: "designations_company_id_fkey", childTrigger: "core_cross_schema_company_reference_trg", parentTrigger: "platform_company_profile_attendance_reference_restrict_trg" }],
  ["attendance.shift_templates->platform.company_profiles", { constraint: "shift_templates_company_id_fkey", childTrigger: "attendance_cross_schema_company_reference_trg", parentTrigger: "platform_company_profile_attendance_reference_restrict_trg" }],
  ["attendance.shift_assignments->core.users", { constraint: "shift_assignments_employee_user_id_fkey", childTrigger: "attendance_cross_schema_employee_reference_trg", parentTrigger: "core_user_attendance_reference_restrict_trg" }],
  ["attendance.shift_instances->core.users", { constraint: "shift_instances_employee_user_id_fkey", childTrigger: "attendance_cross_schema_employee_reference_trg", parentTrigger: "core_user_attendance_reference_restrict_trg" }],
  ["attendance.policies->platform.company_profiles", { constraint: "policies_company_id_fkey", childTrigger: "attendance_cross_schema_company_reference_trg", parentTrigger: "platform_company_profile_attendance_reference_restrict_trg" }],
  ["attendance.policies->core.users", { constraint: "policies_created_by_user_id_fkey", childTrigger: "attendance_cross_schema_creator_reference_trg", parentTrigger: "core_user_attendance_reference_restrict_trg" }],
  ["attendance.policy_versions->core.users", { constraint: "policy_versions_created_by_user_id_fkey", childTrigger: "attendance_cross_schema_creator_reference_trg", parentTrigger: "core_user_attendance_reference_restrict_trg" }],
  ["attendance.policy_assignments->core.users", { constraint: "policy_assignments_created_by_user_id_fkey", childTrigger: "attendance_cross_schema_creator_reference_trg", parentTrigger: "core_user_attendance_reference_restrict_trg" }]
]);

function statementForeignKeys(file: string, sql: string): CrossSchemaForeignKey[] {
  const foreignKeys: CrossSchemaForeignKey[] = [];
  const statements = sql.matchAll(/(?:CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+)([a-z_]+\.[a-z_]+)([\s\S]*?);/giu);
  for (const statement of statements) {
    const table = statement[1];
    const body = statement[2];
    if (!table || !body) continue;
    for (const reference of body.matchAll(/\bREFERENCES\s+([a-z_]+\.[a-z_]+)/giu)) {
      const foreignTable = reference[1];
      if (!foreignTable) continue;
      if (table.split(".")[0] !== foreignTable.split(".")[0]) {
        foreignKeys.push({ file, table, foreignTable });
      }
    }
  }
  return foreignKeys;
}

const crossSchemaForeignKeys = sqlFiles.flatMap((file) => statementForeignKeys(file, read(file)));
const violations: string[] = [];
const replacementSql = sqlFiles.includes(replacementMigration) ? read(replacementMigration) : "";

for (const foreignKey of crossSchemaForeignKeys) {
  if (foreignKey.file.localeCompare(replacementMigration) >= 0) {
    violations.push(
      `${foreignKey.file}: ${foreignKey.table} reintroduces a cross-schema reference after the remediation migration`
    );
    continue;
  }

  const key = `${foreignKey.table}->${foreignKey.foreignTable}`;
  const replacement = replacementConstraints.get(key);
  if (!replacement) {
    violations.push(`${foreignKey.file}: ${foreignKey.table} references ${foreignKey.foreignTable} without a reviewed replacement`);
    continue;
  }

  const dropConstraint = new RegExp(
    `ALTER\\s+TABLE\\s+${foreignKey.table.replace(".", "\\.")}\\s+DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${replacement.constraint}\\s*;`,
    "iu"
  );
  const childTrigger = new RegExp(
    `CREATE\\s+TRIGGER\\s+${replacement.childTrigger}\\s+[\\s\\S]*?ON\\s+${foreignKey.table.replace(".", "\\.")}\\s+`,
    "iu"
  );
  const parentTrigger = new RegExp(
    `CREATE\\s+TRIGGER\\s+${replacement.parentTrigger}\\b`,
    "iu"
  );
  if (!dropConstraint.test(replacementSql) || !childTrigger.test(replacementSql) || !parentTrigger.test(replacementSql)) {
    violations.push(
      `${foreignKey.file}: ${foreignKey.table} references ${foreignKey.foreignTable} without a forward constraint-and-trigger replacement`
    );
  }
}

if (violations.length > 0) {
  fail(`Cross-schema foreign key remediation is incomplete:\n${violations.join("\n")}`);
}

const verifierEnvFile = process.env.HRMS_DB_VERIFY_ENV_FILE ?? ".env.test";
loadEnvFile(verifierEnvFile, {
  override: true,
  required:
    !process.env.HRMS_DB_VERIFY_DATABASE_URL &&
    !process.env.TEST_DATABASE_URL &&
    !process.env.DATABASE_URL
});

const client = new Client({
  connectionString: process.env.HRMS_DB_VERIFY_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? requireEnv("DATABASE_URL")
});
await client.connect();
try {
  const result = await client.query<{
    constraint_schema: string;
    table_name: string;
    foreign_table_schema: string;
    foreign_table_name: string;
  }>(`
    SELECT
      tc.constraint_schema,
      tc.table_name,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_schema <> ccu.table_schema
  `);
  if (result.rowCount && result.rows.length > 0) {
    fail(`Cross-schema foreign keys found in PostgreSQL: ${JSON.stringify(result.rows, null, 2)}`);
  }
} finally {
  await client.end();
}

console.log("No unresolved cross-schema foreign keys found in migration SQL or PostgreSQL metadata.");
