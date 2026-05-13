import { nowIso } from "../../platform/data-store.js";
import { conflict } from "../../platform/errors.js";
import type { MemoryDataStore } from "../../platform/data-store.js";
import type { FinanceGovernanceConfig, UUID } from "#shared";
import { randomUUID } from "node:crypto";

export class PlatformRepository {
  constructor(private readonly store: MemoryDataStore) {}

  getFinanceGovernanceConfig(): FinanceGovernanceConfig | null {
    return this.store.financeGovernanceConfig;
  }

  saveFinanceGovernanceConfig(input: {
    primary_finance_manager_user_id: UUID;
    manager_backup_user_id: UUID | null;
    finance_approval_backup_user_id: UUID | null;
    effective_from: string;
    effective_to: string | null;
    status: "active" | "inactive";
    expected_version: number;
    updated_by_user_id: UUID;
  }): FinanceGovernanceConfig {
    const current = this.store.financeGovernanceConfig;
    if (!current) {
      if (input.expected_version !== 1) {
        throw conflict("Finance governance configuration is not initialized.", {
          aggregate: "finance_governance_config",
          expected_version: input.expected_version,
          current_version: null
        });
      }
      const created = nowIso();
      const config: FinanceGovernanceConfig = {
        id: randomUUID(),
        scope_key: "global",
        primary_finance_manager_user_id: input.primary_finance_manager_user_id,
        manager_backup_user_id: input.manager_backup_user_id,
        finance_approval_backup_user_id: input.finance_approval_backup_user_id,
        status: input.status,
        effective_from: input.effective_from,
        effective_to: input.effective_to,
        updated_by_user_id: input.updated_by_user_id,
        created_at: created,
        updated_at: created,
        deleted_at: null,
        version: 1
      };
      this.store.financeGovernanceConfig = config;
      return config;
    }
    if (current.version !== input.expected_version) {
      throw conflict("Finance governance configuration was modified by another actor.", {
        aggregate: "finance_governance_config",
        id: current.id,
        expected_version: input.expected_version,
        current_version: current.version
      });
    }
    current.primary_finance_manager_user_id = input.primary_finance_manager_user_id;
    current.manager_backup_user_id = input.manager_backup_user_id;
    current.finance_approval_backup_user_id = input.finance_approval_backup_user_id;
    current.effective_from = input.effective_from;
    current.effective_to = input.effective_to;
    current.status = input.status;
    current.updated_by_user_id = input.updated_by_user_id;
    current.updated_at = nowIso();
    current.version += 1;
    return current;
  }
}
