# CLAUDE.md

## Reminders

- **AI classifier needs a current-date injection.** The extraction prompts in `apps/api/src/services/aiExtractor.ts` and the financial agent under `apps/api/src/services/agents/financialAgent/` don't tell the model what today's date is, so period inference (FY/LTM/"current quarter") drifts. Pass the current date into the system prompt at call time, don't hardcode it.
