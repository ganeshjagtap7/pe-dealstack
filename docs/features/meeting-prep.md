# Meeting Prep

Generate a prep brief for a deal meeting. Talking points, risks, questions to ask, suggested agenda.

## Trigger

- "Meeting Prep" in the deal page action menu
- Deal Chat tool: `generate_meeting_prep`
- API: `POST /api/ai/meeting-prep`

## Agent

[`agents/meetingPrep/index.ts`](../../apps/api/src/services/agents/meetingPrep/index.ts).

Parallel fetcher — fans out to 5 sources at once, then runs a single LLM call to synthesize:

1. Deal info (name, stage, financials, team)
2. Active financial statements
3. Activity timeline
4. Linked contacts
5. Company research

Output:

- Talking points
- Suggested questions
- Risks to watch
- Agenda

## Common gotchas

- **Empty brief on a brand-new deal.** Not enough data — populate financials and link contacts first.
- **Wrong company info.** Web research is best-effort; if you've populated `Company.description` it'll prefer that.

## Related

- [`docs/architecture/ai-agents.md#6--meeting-prep`](../architecture/ai-agents.md#6--meeting-prep)
