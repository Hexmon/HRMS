import { createMemoryDataStore, seedIds } from "./data-store.js";

const store = createMemoryDataStore();
console.log(
  JSON.stringify(
    {
      users: store.users.map((user) => ({
        employee_code: user.employee_code,
        email: user.email,
        roles: user.roles
      })),
      seed_ids: seedIds
    },
    null,
    2
  )
);
