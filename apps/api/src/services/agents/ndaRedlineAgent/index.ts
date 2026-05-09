// ─── NDA Red-Line Agent ────────────────────────────────────────────
// Compares a counterparty NDA against the firm's NDA criteria/policy
// and returns structured red-lines: clauses to change, severity,
// suggested replacements, and any required clauses the NDA omits.
//
// v1: criteria is freeform text; output is structured JSON rendered
// as a side-by-side markdown diff in the UI. Word-with-tracked-changes
// export comes in v1.5.

import { z } from 'zod';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { invokeStructured, isLLMAvailable } from '../../llm.js';
import { log } from '../../../utils/logger.js';
import { TOPIC_GUARDRAILS } from '../guardrails.js';

// ─── Output Schema ─────────────────────────────────────────────────

const RedlineSchema = z.object({
  clause: z.string().describe('Short label for the clause/section (e.g. "Section 3 — Term", "Confidentiality scope")'),
  originalText: z.string().describe('Verbatim quote of the problematic text from the counterparty NDA'),
  issue: z.string().describe('Why this clause conflicts with the firm criteria — be specific'),
  severity: z.enum(['critical', 'high', 'medium', 'low']).describe('critical = will not sign; high = strong push back; medium = preferred change; low = nit'),
  suggestedReplacement: z.string().describe('Verbatim replacement text the firm would accept'),
});

const MissingClauseSchema = z.object({
  clauseName: z.string().describe('Name of the required clause (e.g. "Mutual non-solicit carve-out")'),
  why: z.string().describe('Why the firm requires this clause'),
  suggestedAddition: z.string().describe('Verbatim text to add'),
});

const NdaRedlineSchema = z.object({
  acceptable: z.boolean().describe('Would the firm sign this NDA as-is, with no changes?'),
  summary: z.string().describe('Two-sentence overall assessment for the principal'),
  redlines: z.array(RedlineSchema).describe('Specific clauses to red-line, ordered by severity (critical first)'),
  missingClauses: z.array(MissingClauseSchema).describe('Clauses required by firm criteria but absent from this NDA'),
});

export type NdaRedline = z.infer<typeof RedlineSchema>;
export type NdaMissingClause = z.infer<typeof MissingClauseSchema>;
export type NdaRedlineOutput = z.infer<typeof NdaRedlineSchema>;

// ─── Public API ────────────────────────────────────────────────────

export interface NdaRedlineInput {
  organizationId: string;
  firmCriteria: string;
  counterpartyNdaText: string;
  dealId?: string | null;
  documentId?: string | null;
}

export interface NdaRedlineResult extends NdaRedlineOutput {
  status: 'ok' | 'failed';
  error?: string | null;
}

const SYSTEM_PROMPT = `You are an experienced M&A counsel reviewing a counterparty NDA on behalf of a private-equity firm. The firm has given you their NDA criteria/policy. Your job: compare the counterparty NDA against the firm criteria and produce a precise red-line.

${TOPIC_GUARDRAILS}

How to work:
1. Read the firm criteria carefully — every numbered or bulleted item is a hard constraint unless it says "preferred" or "ideally".
2. Scan the counterparty NDA clause-by-clause. For each clause that conflicts with the criteria, produce a red-line entry with: the clause label, a verbatim quote of the offending text, the specific conflict, a severity, and a verbatim replacement.
3. Then identify clauses the firm requires that are missing from this NDA entirely. Add them to missingClauses.
4. Severity rubric:
   - critical: firm will not sign without this change (e.g. one-way → mutual, missing residuals carve-out, unbounded term, broad non-solicit)
   - high: firm always pushes back (e.g. governing law mismatch, overly broad definition of confidential information)
   - medium: firm prefers to change (e.g. notice period, return-of-info language)
   - low: nit, fine to flag but won't block signing

Quoting rules:
- originalText must be a verbatim quote from the counterparty NDA. Do not paraphrase. If exact text spans multiple sentences, quote the full span.
- suggestedReplacement must be drop-in text — fully formed, no placeholders, no "[insert X]" tokens.

If the NDA is fully acceptable as-is, return acceptable=true, an empty redlines array, and an empty missingClauses array. Do not invent issues.`;

/** Run the NDA red-line agent. */
export async function runNdaRedlineAgent(input: NdaRedlineInput): Promise<NdaRedlineResult> {
  if (!isLLMAvailable()) {
    return {
      status: 'failed',
      acceptable: false,
      summary: '',
      redlines: [],
      missingClauses: [],
      error: 'No LLM provider configured',
    };
  }

  if (!input.firmCriteria || input.firmCriteria.trim().length < 20) {
    return {
      status: 'failed',
      acceptable: false,
      summary: '',
      redlines: [],
      missingClauses: [],
      error: 'Firm NDA criteria is empty or too short — please provide your firm policy.',
    };
  }

  if (!input.counterpartyNdaText || input.counterpartyNdaText.trim().length < 200) {
    return {
      status: 'failed',
      acceptable: false,
      summary: '',
      redlines: [],
      missingClauses: [],
      error: 'Counterparty NDA text is empty or too short — could not parse a meaningful document.',
    };
  }

  log.info('Running NDA red-line agent', {
    orgId: input.organizationId,
    dealId: input.dealId,
    documentId: input.documentId,
    criteriaLen: input.firmCriteria.length,
    ndaLen: input.counterpartyNdaText.length,
  });

  try {
    const result = await invokeStructured(
      NdaRedlineSchema,
      [
        new SystemMessage(SYSTEM_PROMPT),
        new HumanMessage(
          `FIRM NDA CRITERIA / POLICY:\n${input.firmCriteria.trim()}\n\n` +
          `─────────\n\n` +
          `COUNTERPARTY NDA:\n${input.counterpartyNdaText.trim()}`
        ),
      ],
      { maxTokens: 4000, temperature: 0.1, label: 'ndaRedline' }
    );

    return { status: 'ok', ...result };
  } catch (error: any) {
    log.error('NDA red-line agent failed', error);
    return {
      status: 'failed',
      acceptable: false,
      summary: '',
      redlines: [],
      missingClauses: [],
      error: error?.message || 'NDA red-line failed',
    };
  }
}
