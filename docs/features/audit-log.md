# Audit Log

Append-only security/operations log. Every sensitive action writes a row.

## Schema

`AuditLog { id, userId, organizationId, action, resourceType, resourceId, severity, ipAddress, metadata, createdAt }`.

Severity ∈ `{INFO, WARNING, ERROR, CRITICAL}`.

## What's logged

- Authentication events (login, signup, password reset)
- Org boundary events (invite, revoke, role change)
- Sensitive writes (deal stage change, financial extraction, document deletion)
- Failed access attempts (cross-org 404s, RBAC 403s)
- Agent runs (financial agent invocation, firm research, etc.)

## Where

- Service: [`services/auditLog.ts`](../../apps/api/src/services/auditLog.ts)
- Route: [`routes/audit.ts`](../../apps/api/src/routes/audit.ts) — read-only, ADMIN only
- Frontend: Admin Command Center → Audit log section

## Retention

Append-only. Don't `DELETE FROM AuditLog`. Archive to cold storage if size becomes a concern.

## Related

- [`docs/architecture/security.md`](../architecture/security.md)
- [Admin & RBAC](./admin-and-rbac.md)
