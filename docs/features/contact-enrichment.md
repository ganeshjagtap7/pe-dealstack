# Contact Enrichment

Fill out contact records from sparse input — even if the user only has a name and a company.

## Trigger

- "AI Enrich" button on `/contacts.html`
- API: `POST /api/ai/enrich-contact`

## Architecture

4-node graph: `research → validate → save | review`.

[`agents/contactEnrichment/index.ts`](../../apps/api/src/services/agents/contactEnrichment/index.ts).

## Confidence caps

The validate node applies **input-sparsity confidence caps** to prevent over-confident enrichments:

| Input | Max confidence |
| --- | --- |
| Name only | 30% |
| Name + email | 50% |
| Name + email + company | full range |

Below a threshold the row routes to `review` instead of `save`. Surfaces in the UI with a "Review" badge so the user can verify before trusting.

## Output fields

Title, company, type (BANKER / ADVISOR / EXECUTIVE / LP / LEGAL), bio, notes, suggested tags.

## Common gotchas

- **Confident wrong answers.** That's exactly what the caps + review routing prevent. If you see them, file an issue with the input + output so we can tighten.
- **Slow on bulk runs.** Use `Run for all` sparingly — each call hits the LLM. AI rate limit is 10 / min.

## Related

- [`docs/architecture/ai-agents.md#5--contact-enrichment`](../architecture/ai-agents.md#5--contact-enrichment)
- [Contacts CRM](./contacts-crm.md)
