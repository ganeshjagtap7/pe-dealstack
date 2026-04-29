# Invitations & Team

Invite teammates, manage roles, revoke access.

## Where

- Settings → Team section: [`apps/web/js/settingsInvite.js`](../../apps/web/js/settingsInvite.js)
- Auto-opens on `#invite` URL hash
- Web-next equivalent in `apps/web-next/src/app/(app)/settings/`

## Modal flow

Two panels:

1. **Form panel** — email + role (`MEMBER` / `VIEWER` / `ADMIN`)
2. **Link panel** (after Send) — read-only invite URL + Copy button. Footer: Done + "Invite Another"

## Backend

| Endpoint | Notes |
| --- | --- |
| `POST /api/invitations` | Create. Always returns `inviteUrl`. |
| `GET /api/invitations` | List. Decorates PENDING with `inviteUrl`; tokens stripped from accepted/expired. |
| `DELETE /api/invitations/:id` | Revoke |
| `POST /api/invitations/:id/resend` | Resend Resend email |
| `GET /api/public/invitations/verify/:token` | Public — invitee uses to load org info |
| `POST /api/public/invitations/accept` | Public — invitee creates account |

## Schema

`Invitation { id, organizationId, email, role, token unique, status: PENDING/ACCEPTED/EXPIRED/REVOKED, invitedBy, createdAt }`.

## Copy-to-clipboard

`navigator.clipboard.writeText` with `document.execCommand('copy')` fallback for non-HTTPS contexts. Green "Copied" feedback for 1.5s.

## Pending invite list

Each PENDING row has a "Copy Link" button.

## Related

- [`docs/diagrams/sample-auth-flow.mmd`](../diagrams/sample-auth-flow.mmd)
- [`docs/user-flows/team-invitation.md`](../user-flows/team-invitation.md)
- [Admin & RBAC](./admin-and-rbac.md)
