# NDA Signature Auto-Detection — Operator Setup

How the app auto-detects that a counterparty has signed an NDA, and what you
need to configure for it to work in production.

---

## Why this exists

Google offers **no eSignature status API**. When a Google Doc eSignature
completes, Google locks the document by adding a **content restriction**
(`readOnly`) to the file. We use that lock as a proxy for "signed": a Drive
[`files.watch`](https://developers.google.com/drive/api/guides/push) channel
notifies our webhook when the Doc changes, and the handler inspects the file's
metadata for the lock.

This is a **probable, not-yet-confirmed** signal — a Doc can be locked for other
reasons, and Google's behavior may change. To let us validate and tune the
heuristic, the backend **logs the raw Drive file metadata on every
notification**. Treat auto-detected signatures as a strong hint, not legal
proof.

When detection fires, the backend flips the `LegalDocument` to
`status: 'SIGNED'` and records:

- `metadata.signatureDetectedVia === 'drive-watch'`
- `metadata.signatureDetectedAt` — ISO timestamp

The gallery UI shows a **"Signed · auto-detected"** badge on those documents
and refetches on tab focus so the flip appears without a manual reload.

---

## One-time GCP setup

Drive `files.watch` **rejects unverified callback addresses**. The domain of the
webhook callback URL (your `APP_URL`) must be verified before any watch channel
will be accepted:

1. **Verify the domain in Google Search Console** — add and verify the
   `APP_URL` domain (e.g. `lmmos.ai`) as a property.
2. **Add it as a verified domain in the GCP project** — in the same GCP project
   that owns the Drive API credentials, go to **APIs & Services → Domain
   verification** and add the domain. It must show as verified there too.

Without both, Drive returns an error when we try to register the watch and
auto-detection silently never starts.

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | yes | Must be `https://` and the **verified custom domain** (e.g. `https://lmmos.ai`). Used to build the webhook callback URL. |
| `CRON_SECRET` | yes | Shared secret for the channel-renewal cron (below). |

> **`*.vercel.app` cannot be domain-verified.** Google will not accept a
> preview/`vercel.app` callback address, so **signature auto-detection only runs
> on the production custom domain**. Preview deployments will not register watch
> channels — this is expected.

---

## Channel renewal cron

Drive watch channels **expire** (max ~7 days). A scheduled job must renew them
before they lapse, or detection quietly stops.

- **Endpoint:** `POST ${APP_URL}/api/webhooks/legal-docs/_cron/renew-watches`
- **Auth header:** `x-cron-secret: $CRON_SECRET`
  (a `Authorization: Bearer $CRON_SECRET` header also works)
- **Recommended schedule:** **daily** — comfortably inside the ~7-day window so a
  single missed run doesn't drop coverage.

Example:

```bash
curl -X POST "$APP_URL/api/webhooks/legal-docs/_cron/renew-watches" \
  -H "x-cron-secret: $CRON_SECRET"
```

---

## The webhook endpoint

- **Endpoint:** `POST /api/webhooks/legal-docs/drive`
- **Public — no auth header.** Google sends no Authorization header on push
  notifications, so this route cannot require one.

Security model:

- Each watch uses a **random per-document channel token**, and the handler
  verifies the incoming **`resourceId`** matches the document it expects — so a
  spoofed notification can't flip an arbitrary doc.
- The handler **always returns `200`**, even on validation failure, so Google
  won't retry-storm the endpoint.

---

## Validating / tuning the heuristic

Because the lock signal is probabilistic, validate it against real signatures
before trusting it broadly:

1. **Find the raw-metadata log line** the backend emits on each notification
   (search your logs for the per-notification Drive file metadata entry).
2. **Confirm the lock flips** — on a genuinely completed signature, check that
   `contentRestrictions[].readOnly` becomes `true` in that metadata.
3. **Adjust detection if Google's actual behavior differs** — if you see the
   lock appear without a real signature (or a real signature without the lock),
   tune the detection logic against the logged metadata rather than assuming the
   `readOnly` flip is exact.
