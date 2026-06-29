// ─── LangChain Tools for Deal Chat Agent ───────────────────────────
// Tools are created per-request with dealId/orgId baked into closures
// so the LLM only needs to pass query-specific parameters.
//
// This file is a barrel — each tool is defined in its own module under
// ./tools/<name>.ts. The order of the array returned by getDealChatTools
// is load-bearing (the agent prompt references tools by name).

import { makeSearchDocumentsTool } from './tools/searchDocuments.js';
import { makeGetDealFinancialsTool } from './tools/getDealFinancials.js';
import { makeCompareDealsTool } from './tools/compareDeals.js';
import { makeGetDealActivityTool } from './tools/getDealActivity.js';
import { makeWebSearchTool } from './tools/webSearch.js';
import { makeGenerateChartTool } from './tools/generateChart.js';
import { makeUpdateDealFieldTool } from './tools/updateDealField.js';
import { makeChangeDealStageTool } from './tools/changeDealStage.js';
import { makeAddNoteTool } from './tools/addNote.js';
import { makeTriggerFinancialExtractionTool } from './tools/triggerFinancialExtraction.js';
import { makeGenerateMeetingPrepTool } from './tools/generateMeetingPrep.js';
import { makeDraftEmailTool } from './tools/draftEmail.js';
import { makeGetAnalysisSummaryTool } from './tools/getAnalysisSummary.js';
import { makeListDocumentsTool } from './tools/listDocuments.js';
import { makeSuggestActionTool, makeScrollToSectionTool } from './tools/navigation.js';
import { makeGetRecentEmailsForDealTool } from './tools/getRecentEmailsForDeal.js';
import { makeGetUpcomingMeetingsForDealTool } from './tools/getUpcomingMeetingsForDeal.js';

/**
 * Create all deal chat tools with dealId/orgId baked in via closures.
 *
 * `userId` is OPTIONAL for backward compat — tools that need it (Gmail /
 * Calendar live readers for /follow-ups) degrade gracefully with a
 * "user context not available" message when it's absent.
 */
export function getDealChatTools(dealId: string, orgId: string, userId?: string) {
  return [
    makeSearchDocumentsTool(dealId, orgId),
    makeGetDealFinancialsTool(dealId, orgId),
    makeCompareDealsTool(dealId, orgId),
    makeGetDealActivityTool(dealId, orgId),
    makeWebSearchTool(),
    makeGenerateChartTool(),
    makeUpdateDealFieldTool(dealId, orgId),
    makeChangeDealStageTool(dealId, orgId),
    makeAddNoteTool(dealId, orgId),
    makeTriggerFinancialExtractionTool(dealId, orgId),
    makeGenerateMeetingPrepTool(dealId, orgId),
    makeDraftEmailTool(dealId, orgId),
    makeGetAnalysisSummaryTool(dealId, orgId),
    makeListDocumentsTool(dealId, orgId),
    makeScrollToSectionTool(dealId, orgId),
    makeSuggestActionTool(dealId, orgId),
    // /follow-ups live readers — order matters per the comment in this file;
    // these go at the end so existing prompt references stay stable.
    makeGetRecentEmailsForDealTool(dealId, orgId, userId),
    makeGetUpcomingMeetingsForDealTool(dealId, orgId, userId),
  ];
}
