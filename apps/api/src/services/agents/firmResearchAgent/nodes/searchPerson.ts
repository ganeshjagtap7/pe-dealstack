// apps/api/src/services/agents/firmResearchAgent/nodes/searchPerson.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb, scrapeLinkedInProfile } from '../../../webSearch.js';
import { log } from '../../../../utils/logger.js';
import { isLinkedInUrl, extractLinkedInSlug, getLinkedInKind } from '../../../../utils/urlHelpers.js';

const MAX_SEARCH_CHARS = 5000;
const NODE_TIMEOUT_MS = 60000; // 60s — Apify LinkedIn scraping needs startup time

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'searchPerson', message, detail };
}

function buildLinkedInSnippet(profile: any): string {
  let snippet = `\n--- LINKEDIN PROFILE (direct) ---\n`;
  snippet += `Name: ${profile.name}\n`;
  snippet += `Headline: ${profile.headline}\n`;
  if (profile.summary) snippet += `About: ${profile.summary}\n`;
  if (profile.location) snippet += `Location: ${profile.location}\n`;
  if (profile.experience?.length > 0) {
    snippet += `\nExperience:\n`;
    for (const exp of profile.experience) {
      snippet += `  - ${exp.title} at ${exp.company} (${exp.duration})\n`;
    }
  }
  if (profile.education?.length > 0) {
    snippet += `\nEducation:\n`;
    for (const edu of profile.education) {
      snippet += `  - ${edu.degree} ${edu.field} — ${edu.school}\n`;
    }
  }
  if (profile.skills?.length > 0) {
    snippet += `\nSkills: ${profile.skills.join(', ')}\n`;
  }
  return snippet;
}

export async function searchPersonNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  if (!state.linkedinUrl) {
    steps.push(step('No LinkedIn URL provided, skipping person search'));
    return { personSearchResults: '', steps };
  }

  if (!isLinkedInUrl(state.linkedinUrl)) {
    steps.push(step('Invalid LinkedIn URL format, skipping', state.linkedinUrl));
    return { personSearchResults: '', steps };
  }

  // Company URLs are handled by searchFirmNode — the personal-profile Apify
  // actor (anchor/linkedin-profile-scraper) only works on /in/<slug> pages,
  // and person-shaped queries don't make sense for a firm page.
  if (getLinkedInKind(state.linkedinUrl) === 'company') {
    steps.push(step('Company LinkedIn URL detected — skipping person search', state.linkedinUrl));
    return { personSearchResults: '', steps };
  }

  const slug = extractLinkedInSlug(state.linkedinUrl);
  steps.push(step('Starting person search', `slug: ${slug || 'unknown'}`));

  // Build search queries
  const queries: string[] = [];
  if (slug) {
    const splitName = slug.replace(/-/g, ' ').replace(/\d+/g, '').trim();
    const capitalizedName = splitName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    queries.push(`${slug} linkedin`);
    queries.push(`"${slug}" bio OR about`);
    queries.push(`${slug} site:x.com OR site:twitter.com OR site:youtube.com`);

    if (state.firmName) {
      if (capitalizedName.length > 2) queries.push(`"${capitalizedName}" "${state.firmName}" linkedin`);
      queries.push(`${slug} "${state.firmName}"`);
      queries.push(`"${state.firmName}" founder OR team OR CEO OR partner`);
    } else {
      queries.push(`${slug} founder OR CEO OR investor`);
      if (capitalizedName.length > 2 && capitalizedName !== slug) {
        queries.push(`"${capitalizedName}" linkedin OR investor OR founder`);
      }
    }
  } else {
    queries.push(state.linkedinUrl);
  }

  // Run LinkedIn scrape + search queries IN PARALLEL
  const [linkedinResult, searchResult] = await Promise.all([
    // Task 1: LinkedIn direct scrape (Apify — may take 30-40s)
    (async () => {
      try {
        const profile = await scrapeLinkedInProfile(state.linkedinUrl);
        if (profile) {
          steps.push(step('LinkedIn profile scraped via Apify', profile.name));
          return buildLinkedInSnippet(profile);
        }
        steps.push(step('LinkedIn scrape returned no data'));
        return '';
      } catch (error) {
        steps.push(step('LinkedIn scrape failed', (error as Error).message));
        return '';
      }
    })(),

    // Task 2: Web search queries (Apify Google or DDG — faster)
    (async () => {
      let allSnippets = '';
      const newSources: string[] = [];
      for (let i = 0; i < queries.length; i++) {
        try {
          const results = await searchWeb(queries[i], 5);
          if (results.length > 0) {
            allSnippets += `\n--- SEARCH: ${queries[i]} ---\n`;
            for (const r of results) {
              allSnippets += `${r.title}\n${r.snippet}\nSource: ${r.url}\n\n`;
            }
            newSources.push(`search:person_q${i + 1}`);
            steps.push(step(`Query ${i + 1}: ${results.length} results`, queries[i]));
          } else {
            steps.push(step(`Query ${i + 1}: no results`, queries[i]));
          }
        } catch (error) {
          steps.push(step(`Query ${i + 1} failed`, (error as Error).message));
        }
      }
      return { snippets: allSnippets, newSources };
    })(),
  ]);

  const allPersonData = (linkedinResult + searchResult.snippets).slice(0, MAX_SEARCH_CHARS + 2000);
  const allSources = [...(state.sources || []), ...searchResult.newSources];
  if (linkedinResult) allSources.push('linkedin:direct');

  log.info('Firm research: person search complete', {
    linkedinUrl: state.linkedinUrl,
    hasLinkedInProfile: !!linkedinResult,
    searchResults: searchResult.newSources.length,
    totalChars: allPersonData.length,
  });

  return {
    personSearchResults: allPersonData,
    sources: allSources,
    steps,
  };
}
