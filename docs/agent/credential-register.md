# Credential Readiness Register

Owner-approved storage choice, 2026-11-11: use existing approved environment/provider secret stores for hosted secrets and ignored local environment files for development/test values. **This tracked file contains no secret values.** It is the central index for what the owner must provide, not a new runtime environment loader or password vault.

No credential inventory was performed while preparing the main-chat prompt. The activated delivery lead must derive exact names from current tracked source/example files and actual task requirements; an empty table does not mean no credentials are needed.

| Task ID | Component / exact variable name | Environment | Purpose / required scope | Approved store or ignored local-file path | Owner action | Readiness | Non-secret verification / date |
| --- | --- | --- | --- | --- | --- | --- | --- |

Readiness values: Not inspected, Local emulator ready, Present/unverified, Verified for named environment, Needs owner, Not required with rationale. Add one row per exact variable/environment; related capabilities should identify their credential owner and least required permissions. Never place values, connection strings, token fragments, personal data or recovery codes in these rows.

## How The Owner Provides A Missing Value

1. Read the row's exact environment, variable name, purpose, minimum scope and existing application configuration path. Do not send the value in chat or the sprint workbook.
2. Set it directly in the named existing approved store, or in the application's already supported local environment file after the lead confirms it is ignored by git. Do not add a new unused .env path or change loaders just to centralize storage. The root currently ignores .env and .env.* except tracked .example templates; recheck actual ignore behavior before saving.
3. Tell the lead only which row/environment is ready. The lead performs a narrowly scoped, authorized non-production verification and records the result without printing the credential.

The lead should reuse authorized configuration where available and maintain tracked examples with placeholders only. Some stores expose presence but not the saved value; report that limitation instead of claiming retrieval. Local synthetic credentials/emulators are not proof of hosted provider integration. Account creation, domain verification, new security-sensitive credentials, payments, expanded access and production configuration remain owner actions or separately authorized operations. Follow [environment safety](environment-safety.md) and [delivery procedure](../process/coordinated-delivery.md).
