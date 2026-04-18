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
    // Convert slug to readable name: "john-doe" → "John Doe", "devlikesbizness" stays as-is
    const splitName = slug.replace(/-/g, ' ').replace(/\d+/g, '').trim();
    const capitalizedName = splitName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Query 1: slug + linkedin (most reliable — DDG indexes LinkedIn profiles this way)
    queries.push(`${slug} linkedin`);

    // Query 2: capitalized name + firm + linkedin (gets cached profile data: title, education, experience)
    if (state.firmName && capitalizedName.length > 2) {
      queries.push(`"${capitalizedName}" "${state.firmName}" linkedin`);
    }

    // Query 3: slug + bio/about (catches Twitter/X bios, personal sites)
    queries.push(`"${slug}" bio OR about`);

    // Query 4: person + firm combination (press mentions, articles)
    if (state.firmName) {
      queries.push(`${slug} "${state.firmName}"`);
    }

    // Query 5: firm founder/team search (catches people not indexed by slug)
    if (state.firmName) {
      queries.push(`"${state.firmName}" founder OR team OR CEO OR partner`);
    }
  } else {
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
          newSources.push(`ddg:person_q${i + 1}`);
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

  log.info('Firm research: person search complete', {
    linkedinUrl: state.linkedinUrl,
    resultChars: result?.snippets?.length || 0,
  });

  return {
    personSearchResults: result?.snippets || '',
    sources: [...(state.sources || []), ...(result?.newSources || [])],
    steps,
  };
}
