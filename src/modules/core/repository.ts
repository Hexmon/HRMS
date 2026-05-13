import type { CoreUser, Department, Designation, UUID } from "#shared";
import type { MemoryDataStore } from "../../platform/data-store.js";

export class CoreRepository {
  constructor(private readonly store: MemoryDataStore) {}

  listUsers(): CoreUser[] {
    return this.store.users.filter((user) => !user.deleted_at);
  }

  findUser(id: UUID): CoreUser | null {
    return this.store.users.find((user) => user.id === id && !user.deleted_at) ?? null;
  }

  findActiveUser(id: UUID): CoreUser | null {
    const user = this.findUser(id);
    return user?.employment_status === "active" ? user : null;
  }

  departments(): Department[] {
    return this.store.departments.filter((department) => !department.deleted_at);
  }

  designations(): Designation[] {
    return this.store.designations.filter((designation) => !designation.deleted_at);
  }
}
