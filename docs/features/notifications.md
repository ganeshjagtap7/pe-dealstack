# Notifications

In-app notifications + transactional emails.

## In-app

`Notification` table with `userId`, `organizationId`, `type`, `title`, `message`, `isRead`.

- Backend: [`routes/notifications.ts`](../../apps/api/src/routes/notifications.ts)
- Frontend center: [`apps/web/js/notificationCenter.js`](../../apps/web/js/notificationCenter.js) — top-right bell icon
- Toasts: [`apps/web/js/notifications.js`](../../apps/web/js/notifications.js) — premium toasts with progress bar, pause-on-hover
- Endpoints: `GET /api/notifications`, `POST /api/notifications/mark-all-read`

> User-id resolution: lookups must use `User.authId` to bridge Supabase Auth UUID and internal `User.id`.

## Triggers (in-app)

- Document request received
- Critical Signal Monitor alert
- Mention in a chat
- Task assigned
- Memo status change to `REVIEW`

## Transactional email

[`Resend`](https://resend.com) for:

- Invitation emails
- Document request emails
- Password reset (via Supabase Auth)
- Phase 2 firm-research-complete (optional)

`RESEND_API_KEY` is required in production.

## Related

- [Invitations & Team](./invitations-and-team.md)
- [Signal Monitor](./signal-monitor.md)
