# Help & Support

The "Help & Support" entry in the user dropdown opens a modal with two cards: book a call, or send written feedback.

## Where

- Modal renderer: `generateHelpSupportModal()` in [`apps/web/js/layoutComponents.js`](../../apps/web/js/layoutComponents.js)
- Wiring: [`apps/web/js/layout.js`](../../apps/web/js/layout.js) injects the modal once per page in `injectLayout()` after header build (idempotent guard via `getElementById`)
- Click handlers: open / close, backdrop click, Escape key, both card buttons

Available on every page that includes the shared layout (dashboard, CRM, contacts, deal, settings, VDR, admin).

## Config

URLs and emails live in [`apps/web/js/onboarding/onboarding-config.js`](../../apps/web/js/onboarding/) under `support`:

```js
support: {
  bookingUrl: 'https://calendar.app.google/vRexQ5AmhivWx2PH6',
  formUrl:    /* falls back to feedback.formUrl */,
  urgentEmails: ['tech@pocketfund.org', 'hello@pocketfund.org']
}
```

`urgentEmails` is an array — modal renders all entries joined with " or ".

## Related

- [`apps/web/js/onboarding/onboarding-feedback.js`](../../apps/web/js/onboarding/) — separate feedback button + BETA badge
