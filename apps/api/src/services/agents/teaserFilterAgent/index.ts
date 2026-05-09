// ─── Teaser Go/No-Go Filter Agent ──────────────────────────────────
// First-pass triage of an inbound teaser/CIM against the firm's
// investment criteria. Returns a GO / NO_GO / MAYBE decision with
// per-criterion scoring and the deal facts the model could extract.
//
// Designed to save the principal time on the 80% of teasers that
// obviously don't match firm criteria. v1 takes freeform criteria
// text (sectors, size, geo, exclusions). Structured criteria UI later.

import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { invokeStructured, isLLMAvailable } from '../../llm.js';
import { log } from '../../../utils/logger.js';
import { TOPIC_GUARDRAILS } from '../guardrails.js';

// ─── Output Schema ─────────────────────────────────────────────────

const ExtractedFactsSchema = z.object({
  company: z.string().nullable().describe('Company / target name'),
  sector: z.string().nullable().describe('Sector or industry'),
  geography: z.string().nullable().describe('Country or region'),
  revenue: z.string().nullable().describe('Revenue with units (e.g. "$8M ARR", "€12M FY24")'),
  ebitda: z.string().nullable().describe('EBITDA with units'),
  askingPrice: z.string().nullable().describe('Asking price or valuation guidance, if disclosed'),
  ownership: z.string().nullable().describe('Ownership / structure / situation (e.g. "founder-owned succession")'),
  notes: z.string().nullable().describe('One sentence of additional context worth capturing'),
});

const CriterionCheckSchema = z.object({
  criterion: z.string().describe('Restate the criterion this check applies to'),
  status: z.enum(['pass', 'fail', 'unclear']).describe('pass = teaser matches; fail = teaser conflicts; unclear = teaser does not say'),
  finding: z.string().describe('What the teaser says about this criterion (verbatim quote if possible)'),
});

const TeaserFilterSchema = z.object({
  decision: z.enum(['GO', 'NO_GO', 'MAYBE']).describe('GO = pursue; NO_GO = pass; MAYBE = need more info before deciding'),
  score: z.number().min(0).max(100).describe('Confidence in the decision (0-100)'),
  summary: z.string().describe('Two-sentence rationale a principal can read in 5 seconds'),
  extractedFacts: ExtractedFactsSchema,
  criteriaChecks: z.array(CriterionCheckSchema).describe('One entry per firm criterion'),
  flags: z.array(z.string()).describe('Additional concerns or positives not tied to a specific criterion (e.g. "customer concentration", "recurring revenue >80%")'),
});

export type TeaserCriterionCheck = z.infer<typeof CriterionCheckSchema>;
export type TeaserExtractedFacts = z.infer<typeof ExtractedFactsSchema>;
export type TeaserFilterOutput = z.infer<typeof TeaserFilterSchema>;

// ─── Public API ────────────────────────────────────────────────────

export interface TeaserFilterInput {
  organizationId: string;
  investmentCriteria: string;
  teaserText: string;
  dealId?: string | null;
  documentId?: string | null;
}

export interface TeaserFilterResult extends TeaserFilterOutput {
  status: 'ok' | 'failed';
  error?: string | null;
}

const EMPTY_FACTS: TeaserExtractedFacts = {
  company: null,
  sector: null,
  geography: null,
  revenue: null,
  ebitda: null,
  askingPrice: null,
  ownership: null,
  notes: null,
};

const SYSTEM_PROMPT = `You are a senior investment associate at a private-equity firm. The principal has given you their investment criteria. Your job: triage an inbound teaser (or CIM) and decide GO / NO_GO / MAYBE in under one minute of the principal's time.

${TOPIC_GUARDRAILS}

How to work:
1. Read the firm criteria. Every numbered or bulleted item is a hard constraint unless it says "preferred" or "ideally".
2. Extract the facts you can from the teaser into extractedFacts. Use null when not stated. Quote units verbatim where possible.
3. For every criterion in the firm policy, produce one entry in criteriaChecks with status pass/fail/unclear and a brief finding (quote the teaser when you can).
4. Decide:
   - NO_GO if any hard criterion is fail (e.g. wrong sector, outside size band, excluded situation like restructuring).
   - GO if all hard criteria are pass and at least one core criterion (sector + size) is a clear match.
   - MAYBE if no hard criterion fails but key facts are unclear and a 5-min follow-up could resolve it.
5. score reflects confidence in the decision, not deal quality. NO_GO with clear evidence = high score. MAYBE = lower.
6. summary is for a principal who will read 50 of these a week — be terse, specific, no fluff.

Do not invent facts. If the teaser does not state revenue, do not estimate. Use null.

flags is for things the principal will care about that aren't already covered by criteria — customer concentration, recurring revenue mix, owner involvement, regulatory exposure, etc. Keep to 0–4 items.`;

/** Run the teaser go/no-go filter agent. */
export async function runTeaserFilterAgent(input: TeaserFilterInput): Promise<TeaserFilterResult> {
  if (!isLLMAvailable()) {
    return {
      status: 'failed',
      decision: 'MAYBE',
      score: 0,
      summary: '',
      extractedFacts: EMPTY_FACTS,
      criteriaChecks: [],
      flags: [],
      error: 'No LLM provider configured',
    };
  }

  if (!input.investmentCriteria || input.investmentCriteria.trim().length < 20) {
    return {
      status: 'failed',
      decision: 'MAYBE',
      score: 0,
      summary: '',
      extractedFacts: EMPTY_FACTS,
      criteriaChecks: [],
      flags: [],
      error: 'Investment criteria is empty or too short — please provide your firm policy.',
    };
  }

  if (!input.teaserText || input.teaserText.trim().length < 100) {
    return {
      status: 'failed',
      decision: 'MAYBE',
      score: 0,
      summary: '',
      extractedFacts: EMPTY_FACTS,
      criteriaChecks: [],
      flags: [],
      error: 'Teaser text is empty or too short — could not parse a meaningful document.',
    };
  }

  log.info('Running teaser filter agent', {
    orgId: input.organizationId,
    dealId: input.dealId,
    documentId: input.documentId,
    criteriaLen: input.investmentCriteria.length,
    teaserLen: input.teaserText.length,
  });

  try {
    const result = await invokeStructured(
      TeaserFilterSchema,
      [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(
          `FIRM INVESTMENT CRITERIA:\n${input.investmentCriteria.trim()}\n\n` +
          `─────────\n\n` +
          `TEASER:\n${input.teaserText.trim()}`
        ),
      ],
      { maxTokens: 3000, temperature: 0.1, label: 'teaserFilter' }
    );

    return { status: 'ok', ...result };
  } catch (error: any) {
    log.error('Teaser filter agent failed', error);
    return {
      status: 'failed',
      decision: 'MAYBE',
      score: 0,
      summary: '',
      extractedFacts: EMPTY_FACTS,
      criteriaChecks: [],
      flags: [],
      error: error?.message || 'Teaser filter failed',
    };
  }
}
