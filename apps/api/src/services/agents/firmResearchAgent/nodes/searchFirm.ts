// apps/api/src/services/agents/firmResearchAgent/nodes/searchFirm.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb } from '../../../webSearch.js';
import { log } from '../../../../utils/logger.js';

const MAX_SEARCH_CHARS = 5000;
const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'searchFirm', message, detail };
}

export async function searchFirmNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];
  const firmName = state.firmName;

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

  const timeoutPromise = new Promise<string>((resolve) =>
    setTimeout(() => resolve(''), NODE_TIMEOUT_MS)
  );

  const searchPromise = async (): Promise<string> => {
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

    // Update sources
    const existingSources = state.sources || [];
    state.sources = [...existingSources, ...newSources];

    return allSnippets.slice(0, MAX_SEARCH_CHARS);
  };

  const result = await Promise.race([searchPromise(), timeoutPromise]);

  if (!result) {
    steps.push(step('Firm search timed out after 15s'));
  }

  log.info('Firm research: firm search complete', {
    firmName,
    resultChars: result?.length || 0,
  });

  return {
    firmSearchResults: result || '',
    sources: state.sources,
    steps,
  };
}
