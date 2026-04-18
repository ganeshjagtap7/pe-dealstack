// apps/api/src/services/agents/firmResearchAgent/nodes/searchPerson.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb } from '../../../webSearch.js';
import { log } from '../../../../utils/logger.js';
import { isLinkedInUrl, extractLinkedInSlug } from '../../../../utils/urlHelpers.js';

const MAX_SEARCH_CHARS = 5000;
const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'searchPerson', message, detail };
}

export async function searchPersonNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  if (!state.linkedinUrl) {
    steps.push(step('No LinkedIn URL provided, skipping person search'));
    return { personSearchResults: '', steps };
  }

  // Validate LinkedIn URL format
  if (!isLinkedInUrl(state.linkedinUrl)) {
    steps.push(step('Invalid LinkedIn URL format, skipping', state.linkedinUrl));
    return { personSearchResults: '', steps };
  }

  const slug = extractLinkedInSlug(state.linkedinUrl);
  steps.push(step('Starting person search', `slug: ${slug || 'unknown'}`));

  const queries: string[] = [];

  if (slug) {
    // Query 1: slug + "linkedin" (most reliable — DDG indexes LinkedIn profiles this way)
    queries.push(`${slug} linkedin`);

    // Query 2: split slug into words for broader search
    // "devlikesbizness" stays as-is, "john-doe" → "john doe"
    const splitName = slug.replace(/-/g, ' ').replace(/\d+/g, '').trim();
    if (splitName !== slug && splitName.length > 2) {
      queries.push(`${splitName} linkedin`);
    }

    // Query 3: person + firm combination
    if (state.firmName) {
      queries.push(`${slug} "${state.firmName}"`);
    }

    // Query 4: firm founder/team search (catches people not indexed by slug)
    if (state.firmName) {
      queries.push(`"${state.firmName}" founder OR team OR CEO OR partner`);
    }
  } else {
    queries.push(state.linkedinUrl);
  }

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
          newSources.push(`ddg:person_q${i + 1}`);
          steps.push(step(`Query ${i + 1}: ${results.length} results`, query));
        } else {
          steps.push(step(`Query ${i + 1}: no results`, query));
        }
      } catch (error) {
        steps.push(step(`Query ${i + 1} failed`, (error as Error).message));
      }
    }

    const existingSources = state.sources || [];
    state.sources = [...existingSources, ...newSources];

    return allSnippets.slice(0, MAX_SEARCH_CHARS);
  };

  const result = await Promise.race([searchPromise(), timeoutPromise]);

  log.info('Firm research: person search complete', {
    linkedinUrl: state.linkedinUrl,
    resultChars: result?.length || 0,
  });

  return {
    personSearchResults: result || '',
    sources: state.sources,
    steps,
  };
}
