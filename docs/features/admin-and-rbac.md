# Admin & RBAC

Roles + admin command center for ops/COO users.

## Roles

| Role | Access |
| --- | --- |
| `ADMIN` | Full org access; user management; invite/revoke; admin dashboard |
| `MEMBER` | Standard — deal operations |
| `OPS` | Operations role; limited AI usage |
| `VIEWER` | Read-only; cannot modify |

`DealTeamMember.accessLevel` (`view | edit | admin`) layers per-deal permissions on top of the org role.

## Admin Command Center

`/admin-dashboard.html` (legacy) and `/admin` (web-next).

| Section | Purpose |
| --- | --- |
| Stats cards | Counts (deals, tasks, overdue). Click-to-scroll via `data-scroll-to` |
| Tasks | Bulk assign, due dates, mark done. Overdue card filters table |
| Audit log | Read-only `AuditLog` with severity filters |
| Team roster | `User` rows with role badges; invite / revoke / change role |
| Pending invitations | PENDING `Invitation` rows with copy-link buttons |

Files: [`apps/web/admin-dashboard.html`](../../apps/web/admin-dashboard.html) + `admin-dashboard.js` + `admin-tasks.js` + `admin-modals.js`.

## RBAC enforcement

- Frontend hides admin buttons based on `userRole` (UX hint).
- API enforces with [`rbacMiddleware`](../../apps/api/src/middleware/rbac.ts) — must run after `orgMiddleware` so `req.userRole` is set.
- Cross-org access — always 404, never 403 (anti-enumeration).

## Diagrams

- [`docs/diagrams/09-role-access-matrix.mmd`](../diagrams/09-role-access-matrix.mmd)
- [`docs/diagrams/13-multi-tenancy-org-isolation.mmd`](../diagrams/13-multi-tenancy-org-isolation.mmd)

## Related

- [`docs/architecture/security.md`](../architecture/security.md)
- [`docs/user-flows/admin-command-center.md`](../user-flows/admin-command-center.md)
