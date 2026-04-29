# Settings

Per-user and per-org configuration.

## Where

- Legacy: [`apps/web/settings.html`](../../apps/web/settings.html) + [`apps/web/settings.js`](../../apps/web/settings.js) + helpers
- Web-next: `apps/web-next/src/app/(app)/settings/`

## Sections

| Section | What's there |
| --- | --- |
| Profile | Name, title, email, password change. Backed by `User` row + `User.preferences` JSONB |
| Firm | `Organization` fields (name, logo, industry). ADMIN only |
| Firm Profile | The Firm Research Agent output. Refresh button to re-run enrichment |
| Team | `#section-team` — invitation list + invite modal (`settingsInvite.js`) |
| Preferences | Theme, notifications, default views (stored in `User.preferences`) |
| Integrations | Connected services (future) |
| Billing | Plan + maxUsers (future) |

## Backend

- [`routes/users.ts`](../../apps/api/src/routes/users.ts) + [`routes/users-profile.ts`](../../apps/api/src/routes/users-profile.ts)
- [`routes/invitations.ts`](../../apps/api/src/routes/invitations.ts)
- [`routes/onboarding.ts`](../../apps/api/src/routes/onboarding.ts) — `/enrich-firm` powers the Firm Profile refresh

## URL hashes

`#section-team` jumps to team management. `#invite` auto-opens the invite modal.

## Related

- [Firm Research](./firm-research.md)
- [Invitations & Team](./invitations-and-team.md)
