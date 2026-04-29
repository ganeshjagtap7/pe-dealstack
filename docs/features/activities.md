# Activities

Append-only timeline of events on a deal — notes, calls, meetings, emails, stage changes, document uploads, deal-imported events.

## Schema

`Activity` — `{ dealId, userId, type, title, description, createdAt }`.

Type values include: `NOTE_ADDED`, `CALL_LOGGED`, `MEETING_LOGGED`, `EMAIL_LOGGED`, `STAGE_CHANGED`, `DOCUMENT_UPLOADED`, `DOCUMENT_REQUESTED`, `DEAL_IMPORTED`, `DEAL_CREATED`, `MEMO_CREATED`, `EXTRACTION_TRIGGERED`.

## Where it shows up

- Activity tab on the deal page
- Recent-activity widget on the dashboard
- Deal Chat tool: `get_deal_activity`

## Backend

[`routes/activities.ts`](../../apps/api/src/routes/activities.ts).

Most activities are written automatically by the routes that perform the underlying action (e.g. `documents-upload.ts` writes `DOCUMENT_UPLOADED`). User-authored notes are written via `add_note` tool in Deal Chat or directly through `POST /api/deals/:id/activities`.

## Filtering

Frontend supports filtering by type, user, and date range.

## Related

- [Deal Detail](./deal-detail.md)
