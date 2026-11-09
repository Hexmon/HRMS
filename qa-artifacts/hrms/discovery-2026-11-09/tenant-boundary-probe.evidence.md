# Synthetic Tenant Boundary API Probe

Executed 2026-11-09 09:29 IST, revision `af89c6ac60fc32417ee2fcfea54399e0a0358411` plus dirty worktree. Command, from `hrms_backend/`:

```bash
pnpm exec tsx ../qa-artifacts/hrms/discovery-2026-11-09/tenant-boundary-probe.ts > ../qa-artifacts/hrms/discovery-2026-11-09/tenant-boundary-probe.result.json
```

The [probe source](tenant-boundary-probe.ts) uses a seeded **synthetic** in-memory Fastify store, a second active company, real local login/session and HTTP route injection. It assigns the seeded asset to Company A employee E1, then changes the current company preferences of seeded Admin, Asset Manager and project manager to B. The original seeded helpdesk requester, project members and assigned asset employee remain A. No Docker, network application endpoint, cloud provider, production data or external service was used. The first two setup attempts failed before a request because of the script's module format and a mistaken asset fixture assumption; the source was corrected and the final run exited 0.

| Probe | Intended SaaS boundary | Observed final result |
| --- | --- | --- |
| B Asset Manager lists assets | An asset tied to A's employee stays with A until an authorized transfer. | HTTP 200; list contained that asset. |
| B Admin gets A helpdesk ticket by ID | Original company owns the historical ticket even if its assignee later moves. | HTTP 200. |
| B Admin gets A project by ID | Original company owns the historical project even if its manager later moves. | HTTP 200. |
| B Admin reads security settings | Company Admin should not change another company's settings; exact default/inheritance rule is pending DEC-Q12. | HTTP 200 for the global settings route. This alone does **not** prove a cross-company mutation. |

The exact booleans/statuses are in [the JSON result](tenant-boundary-probe.result.json). This is a reproduced **in-memory API behavior** at the route/auth/service seam. The fixture models a preference reassignment directly; it does not execute the future old/new-HR transfer workflow. PostgreSQL isolation, multi-instance consistency, browser UI, and hosted behavior remain unverified. The asset's original company is represented by the synthetic A employee assignment because the asset row has no company ID. Follow with disposable PostgreSQL A/B tests, then a real browser journey when the browser origin gate permits it.

Later decision update: `DEC-Q12`, still open when this probe ran, was resolved by `DEC-015` (versioned inherited platform defaults with a mandatory security floor). The observed HTTP result and original table above are unchanged.
