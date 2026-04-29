# Email Drafter

Draft deal-related emails. 4-node graph that produces a draft → tone-checks → compliance-checks → finalises.

## Trigger

- Deal page action menu → "Draft Email"
- Deal Chat tool: `draft_email`
- Frontend module: [`apps/web/js/ai-email-drafter.js`](../../apps/web/js/ai-email-drafter.js)
- API: `POST /api/ai/draft-email`

## Templates (7)

- Initial outreach
- Follow-up
- Document request
- Meeting confirmation
- Pass / decline
- IC update
- Closing congratulations

## Tones (5)

Formal, Direct, Warm, Concise, Conversational.

## Compliance check

Enforces PE-specific rules: no MNPI exposure, no forward-looking statements without disclaimers, no selective disclosure violations. State `compliance_issues` is returned if anything trips.

## Final state

`ready_for_review` — draft + reasoning + suggested subject lines. The user reviews and sends from their email client (we don't send on their behalf without explicit opt-in).

## Implementation

[`agents/emailDrafter/index.ts`](../../apps/api/src/services/agents/emailDrafter/index.ts).

## Related

- [`docs/architecture/ai-agents.md#8--email-drafter`](../architecture/ai-agents.md#8--email-drafter)
