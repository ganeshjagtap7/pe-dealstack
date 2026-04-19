// ─── Memo Agent — Parallel Section Generation Pipeline ───────────────────────
// Orchestrates parallel LLM calls to generate all IC memo sections at once.

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { buildMemoContext, formatContextForLLM, MemoContext } from './context.js';
import {
  MEMO_SYSTEM_PROMPT,
  SECTION_PROMPTS,
  SectionType,
  COMPREHENSIVE_IC_SECTIONS,
} from './prompts.js';
import { getChatModel, isLLMAvailable } from '../../llm.js';
import { MODEL_REASONING } from '../../../utils/aiModels.js';
import { log } from '../../../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedSection {
  type: string;
  title: string;
  content: string;
  tableData?: any;
  chartConfig?: any;
  aiGenerated: boolean;
  aiModel: string;
  sortOrder?: number;
}

// ─── Placeholder helpers ──────────────────────────────────────────────────────

const FINANCIAL_PLACEHOLDER =
  '<p><em>[Financial data not yet available. Upload financial documents to auto-generate this section.]</em></p>';

function makePlaceholder(
  sectionType: string,
  title: string,
  content: string,
  aiModel: string,
  sortOrder?: number,
): GeneratedSection {
  return {
    type: sectionType,
    title,
    content,
    aiGenerated: false,
    aiModel,
    ...(sortOrder !== undefined ? { sortOrder } : {}),
  };
}

// ─── generateSection ──────────────────────────────────────────────────────────

export async function generateSection(
  sectionType: SectionType,
  context: MemoContext,
  customPrompt?: string,
  sortOrder?: number,
): Promise<GeneratedSection> {
  const promptConfig = SECTION_PROMPTS[sectionType];

  if (!promptConfig) {
    return makePlaceholder(
      sectionType,
      sectionType,
      `<p><em>[Unknown section type: ${sectionType}]</em></p>`,
      'error',
      sortOrder,
    );
  }

  const { title, requiresFinancials, includeTableData, includeChartConfig } = promptConfig;

  // If section requires financials but none are available, return placeholder
  if (requiresFinancials && (!context.financials || context.financials.length === 0)) {
    return {
      ...makePlaceholder(sectionType, title, FINANCIAL_PLACEHOLDER, 'placeholder', sortOrder),
    };
  }

  try {
    const model = getChatModel(0.7, 2000);
    const sectionPrompt = customPrompt ?? promptConfig.prompt;
    const contextText = formatContextForLLM(context);

    const formatInstruction =
      includeTableData || includeChartConfig
        ? '\n\nReturn your response as valid JSON matching the structure described in the prompt above.'
        : '\n\nReturn your response as clean HTML only (no markdown, no code fences).';

    const userPrompt = `${sectionPrompt}\n\n---\n\n## Deal Context\n\n${contextText}${formatInstruction}`;

    const response = await model.invoke([
      new SystemMessage(MEMO_SYSTEM_PROMPT),
      new HumanMessage(userPrompt),
    ]);

    const rawText =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    let content = rawText;
    let tableData: any = undefined;
    let chartConfig: any = undefined;

    if (includeTableData || includeChartConfig) {
      // Strip markdown code fences if present
      const stripped = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

      try {
        const parsed = JSON.parse(stripped);
        content = parsed.content ?? rawText;
        if (parsed.tableData !== undefined) tableData = parsed.tableData;
        if (parsed.chartConfig !== undefined) chartConfig = parsed.chartConfig;
      } catch {
        // JSON parse failed — use raw text as content
        log.warn(`[memoAgent/pipeline] JSON parse failed for section ${sectionType}, using raw text`);
        content = rawText;
      }
    }

    return {
      type: sectionType,
      title,
      content,
      ...(tableData !== undefined ? { tableData } : {}),
      ...(chartConfig !== undefined ? { chartConfig } : {}),
      aiGenerated: true,
      aiModel: MODEL_REASONING,
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    };
  } catch (err: any) {
    log.error(`[memoAgent/pipeline] Error generating section ${sectionType}: ${err?.message}`);
    return makePlaceholder(
      sectionType,
      title,
      `<p><em>[Section generation failed: ${err?.message ?? 'Unknown error'}]</em></p>`,
      'error',
      sortOrder,
    );
  }
}

// ─── generateAllSections ──────────────────────────────────────────────────────

export async function generateAllSections(
  dealId: string,
  orgId: string,
  sectionTypes?: SectionType[],
): Promise<{ sections: GeneratedSection[]; context: MemoContext }> {
  if (!isLLMAvailable()) {
    throw new Error('LLM is not available. Check API key configuration.');
  }

  const types = sectionTypes ?? COMPREHENSIVE_IC_SECTIONS;

  log.info(`[memoAgent/pipeline] Building memo context for deal ${dealId}`);
  const context = await buildMemoContext(dealId, orgId);

  log.info(`[memoAgent/pipeline] Generating ${types.length} sections in parallel`);

  const sections = await Promise.all(
    types.map((sectionType, index) =>
      generateSection(sectionType, context, undefined, index + 1),
    ),
  );

  const generated = sections.filter((s) => s.aiGenerated).length;
  const failed = sections.filter((s) => s.aiModel === 'error').length;

  log.info(
    `[memoAgent/pipeline] Completed: ${sections.length} total, ${generated} generated, ${failed} failed`,
  );

  return { sections, context };
}
