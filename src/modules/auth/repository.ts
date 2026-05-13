import type { CoreUser } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";

export class AuthRepository {
  constructor(private readonly store: MemoryDataStore) {}

  findUserByEmployeeCode(employeeCode: string): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.employee_code.toLowerCase() === employeeCode.toLowerCase() &&
          user.employment_status === "active" &&
          !user.deleted_at
      ) ?? null
    );
  }

  findUserByEmail(email: string): CoreUser | null {
    return (
      this.store.users.find(
        (user) =>
          user.email.toLowerCase() === email.toLowerCase() &&
          !user.deleted_at
      ) ?? null
    );
  }

  findActivePasswordHash(userId: string): string | null {
    return (
      this.store.userCredentials.find(
        (credential) =>
          credential.user_id === userId &&
          credential.status === "active" &&
          !credential.deleted_at
      )?.password_hash ?? null
    );
  }
}
