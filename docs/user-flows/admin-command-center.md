# Flow — Admin Command Center

The Admin Dashboard is the operations cockpit for COO / Chief of Staff users at PE firms and search funds. RBAC-gated to roles `ADMIN`, `partner`, `principal`.

## Page

`/admin-dashboard.html` (legacy) and `/admin` route in `apps/web-next/src/app/(app)/admin/`.

## Components

| Layer | File |
| --- | --- |
| Frontend | [`apps/web/admin-dashboard.html`](../../apps/web/admin-dashboard.html) + `admin-dashboard.js` + `admin-tasks.js` + `admin-modals.js` |
| Backend | [`audit.ts`](../../apps/api/src/routes/audit.ts), [`tasks.ts`](../../apps/api/src/routes/tasks.ts), [`activities.ts`](../../apps/api/src/routes/activities.ts), [`users.ts`](../../apps/api/src/routes/users.ts), [`invitations.ts`](../../apps/api/src/routes/invitations.ts) |
| RBAC | Non-admin roles get Assign / Create buttons hidden client-side; the API rejects writes with 403 |

## Features

- **Stats cards.** Click-to-scroll via `data-scroll-to` attributes. Overdue card auto-filters the task table.
- **Task management.** Bulk assign, set due dates, mark done. Tasks are org-scoped via `organizationId`.
- **Audit log.** Reads `AuditLog` table with severity filters (`INFO`, `WARNING`, `ERROR`, `CRITICAL`).
- **Team roster.** List of `User` rows with role badges. Invite / revoke / change-role from here.
- **Pending invitations.** PENDING `Invitation` rows with copy-link buttons.

## RBAC enforcement

Client side hides buttons. **Trust the API only** — `rbacMiddleware` on each write route rejects unauthorised callers with 403.

## Common issues

- **Non-admin sees admin link.** The sidebar checks `userRole` from the session; if the role hasn't been refreshed after a change, the link can linger. Re-login or hit `/api/users/me`.
- **Audit log slow on large orgs.** The query is paginated; default page size 50. If a user is exporting, route through `/api/export`.

## Related

- [`docs/diagrams/09-role-access-matrix.mmd`](../diagrams/09-role-access-matrix.mmd)
- [`docs/architecture/security.md`](../architecture/security.md)
- [`docs/features/admin-and-rbac.md`](../features/admin-and-rbac.md)
