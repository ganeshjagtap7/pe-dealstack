// apps/api/src/services/agents/firmResearchAgent/nodes/searchFirm.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb } from '../../../webSearch.js';
import { log } from '../../../../utils/logger.js';
import { getLinkedInKind, extractLinkedInCompanySlug } from '../../../../utils/urlHelpers.js';

const MAX_SEARCH_CHARS = 5000;
const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'searchFirm', message, detail };
}

/**
 * Humanise a LinkedIn company slug for use as a fallback firm name.
 * "pocket-fund" → "pocket fund", "blackstone-group_2" → "blackstone group"
 */
function humaniseCompanySlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchFirmNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  // Detect a LinkedIn company URL up-front so we can use it as a signal:
  //   1. fall back to a humanised slug as firm name when state.firmName is empty
  //   2. add 1-2 extra DDG queries that surface the company's "About" page
  const linkedinKind = state.linkedinUrl ? getLinkedInKind(state.linkedinUrl) : null;
  const companySlug =
    linkedinKind === 'company' ? extractLinkedInCompanySlug(state.linkedinUrl) : null;
  const inferredFirmName =
    !state.firmName && companySlug ? humaniseCompanySlug(companySlug) : '';
  const firmName = state.firmName || inferredFirmName;

  if (inferredFirmName) {
    steps.push(
      step(
        'Inferred firm name from LinkedIn company slug',
        `${companySlug} → ${inferredFirmName}`,
      ),
    );
  }

  if (!firmName) {
    steps.push(step('No firm name available, skipping firm search'));
    return { firmSearchResults: '', steps };
  }

  steps.push(step('Starting DuckDuckGo searches for firm intel'));

  const queries = [
    `"${firmName}" private equity`,
    `"${firmName}" portfolio deals investments`,
    `"${firmName}" fund raise announcement`,
  ];

  // Extra signals when we have a LinkedIn company URL — DDG's snippets give us
  // the firm description/About text without hitting LinkedIn directly (which
  // rate-limits and auth-walls unauthenticated scrapers).
  if (companySlug) {
    queries.push(`"${companySlug}" linkedin company`);
    queries.push(state.linkedinUrl);
  }

  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), NODE_TIMEOUT_MS)
  );

  const searchPromise = async (): Promise<{ snippets: string; newSources: string[] }> => {
    let allSnippets = '';
    const newSources: string[] = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      try {
        const results = await searchWeb(query, 5);
        if (results.length > 0) {
          allSnippets += `\n--- SEARCH: ${query} ---\n`;
          for (const r of results) {
            allSnippets += `${r.title}\n${r.snippet}\nSource: ${r.url}\n\n`;
          }
          newSources.push(`ddg:firm_q${i + 1}`);
          steps.push(step(`Query ${i + 1}: ${results.length} results`, query));
        } else {
          steps.push(step(`Query ${i + 1}: no results`, query));
        }
      } catch (error) {
        steps.push(step(`Query ${i + 1} failed`, (error as Error).message));
      }
    }

    return { snippets: allSnippets.slice(0, MAX_SEARCH_CHARS), newSources };
  };

  const result = await Promise.race([searchPromise(), timeoutPromise]);

  if (!result) {
    steps.push(step('Firm search timed out after 15s'));
  }

  log.info('Firm research: firm search complete', {
    firmName,
    resultChars: result?.snippets?.length || 0,
  });

  return {
    firmSearchResults: result?.snippets || '',
    sources: [...(state.sources || []), ...(result?.newSources || [])],
    steps,
  };
}
