// apps/api/src/services/agents/firmResearchAgent/nodes/searchPerson.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb, scrapeLinkedInProfile } from '../../../webSearch.js';
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

  // Try direct LinkedIn profile scrape via Apify (richest data source)
  let linkedinSnippet = '';
  try {
    const linkedinProfile = await scrapeLinkedInProfile(state.linkedinUrl);
    if (linkedinProfile) {
      steps.push(step('LinkedIn profile scraped via Apify', linkedinProfile.name));
      linkedinSnippet = `\n--- LINKEDIN PROFILE (direct) ---\n`;
      linkedinSnippet += `Name: ${linkedinProfile.name}\n`;
      linkedinSnippet += `Headline: ${linkedinProfile.headline}\n`;
      if (linkedinProfile.summary) linkedinSnippet += `About: ${linkedinProfile.summary}\n`;
      if (linkedinProfile.location) linkedinSnippet += `Location: ${linkedinProfile.location}\n`;
      if (linkedinProfile.experience.length > 0) {
        linkedinSnippet += `\nExperience:\n`;
        for (const exp of linkedinProfile.experience) {
          linkedinSnippet += `  - ${exp.title} at ${exp.company} (${exp.duration})\n`;
        }
      }
      if (linkedinProfile.education.length > 0) {
        linkedinSnippet += `\nEducation:\n`;
        for (const edu of linkedinProfile.education) {
          linkedinSnippet += `  - ${edu.degree} ${edu.field} — ${edu.school}\n`;
        }
      }
      if (linkedinProfile.skills.length > 0) {
        linkedinSnippet += `\nSkills: ${linkedinProfile.skills.join(', ')}\n`;
      }
    }
  } catch (error) {
    steps.push(step('LinkedIn scrape skipped', (error as Error).message));
  }

  const queries: string[] = [];

  if (slug) {
    // Convert slug to readable name: "john-doe" → "John Doe", "devlikesbizness" stays as-is
    const splitName = slug.replace(/-/g, ' ').replace(/\d+/g, '').trim();
    const capitalizedName = splitName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Query 1: slug + linkedin (most reliable — DDG indexes LinkedIn profiles)
    queries.push(`${slug} linkedin`);

    // Query 2: slug + bio/about (catches Twitter/X bios, personal sites)
    queries.push(`"${slug}" bio OR about`);

    // Query 3: slug on social platforms (twitter, youtube, etc.)
    queries.push(`${slug} site:x.com OR site:twitter.com OR site:youtube.com`);

    // Queries that need firm name
    if (state.firmName) {
      // Query 4: name + firm + linkedin (cached profile with education, experience)
      if (capitalizedName.length > 2) {
        queries.push(`"${capitalizedName}" "${state.firmName}" linkedin`);
      }
      // Query 5: person + firm combination (press mentions)
      queries.push(`${slug} "${state.firmName}"`);
      // Query 6: firm team search
      queries.push(`"${state.firmName}" founder OR team OR CEO OR partner`);
    } else {
      // No firm name — add extra person-only queries
      queries.push(`${slug} founder OR CEO OR investor`);
      if (capitalizedName.length > 2 && capitalizedName !== slug) {
        queries.push(`"${capitalizedName}" linkedin OR investor OR founder`);
      }
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

  const allPersonData = linkedinSnippet + (result?.snippets || '');
  const allSources = [...(state.sources || []), ...(result?.newSources || [])];
  if (linkedinSnippet) allSources.push('linkedin:direct');

  return {
    personSearchResults: allPersonData.slice(0, MAX_SEARCH_CHARS + 2000), // Extra room for LinkedIn data
    sources: allSources,
    steps,
  };
}
