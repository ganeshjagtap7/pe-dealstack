# Tasks

Assignable to-dos. Per-org, optionally attached to a deal.

## Schema

`Task` — `{ id, dealId?, organizationId, assignedTo, title, description, status, dueDate, createdAt }`.

## Where

- Backend: [`routes/tasks.ts`](../../apps/api/src/routes/tasks.ts)
- Frontend (admin cockpit): [`apps/web/admin-tasks.js`](../../apps/web/admin-tasks.js) — bulk assign, set due dates, mark done
- Frontend (dashboard widget): [`apps/web/dashboard-tasks.js`](../../apps/web/dashboard-tasks.js)

## Status values

`OPEN`, `IN_PROGRESS`, `DONE`, `BLOCKED`.

## Backfill in admin dashboard

Stat cards show counts; clicking "Overdue" filters the task table to overdue rows.

## Related

- [Admin & RBAC](./admin-and-rbac.md)
- [Dashboard](./dashboard.md)
