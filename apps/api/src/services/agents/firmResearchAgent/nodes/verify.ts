// apps/api/src/services/agents/firmResearchAgent/nodes/verify.ts
import { FirmResearchStateType, AgentStep } from '../state.js';
import { searchWeb } from '../../../webSearch.js';
import { log } from '../../../../utils/logger.js';

const NODE_TIMEOUT_MS = 15000;

function step(message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node: 'verify', message, detail };
}

export async function verifyNode(
  state: FirmResearchStateType,
): Promise<Partial<FirmResearchStateType>> {
  const steps: AgentStep[] = [];

  if (!state.firmProfile) {
    steps.push(step('No firm profile to verify'));
    return { status: 'failed', steps };
  }

  steps.push(step('Starting cross-validation'));

  const profile = { ...state.firmProfile };
  let verifiedCount = 0;
  let totalChecks = 0;

  // 1. Verify firm name matches Organization name
  if (state.firmName && profile.description) {
    totalChecks++;
    const nameInDesc = profile.description.toLowerCase().includes(state.firmName.toLowerCase());
    if (nameInDesc) {
      verifiedCount++;
      steps.push(step('Firm name matches description'));
    } else {
      steps.push(step('Firm name not found in description — may be inaccurate'));
    }
  }

  // 2. Verify portfolio companies exist (search for co-occurrence with firm name)
  if (profile.portfolioCompanies.length > 0 && state.firmName) {
    const verifiedPortfolio = [];
    const toVerify = profile.portfolioCompanies.slice(0, 5); // Cap at 5 to limit searches

    const timeoutAt = Date.now() + NODE_TIMEOUT_MS;

    for (const company of toVerify) {
      if (Date.now() > timeoutAt) {
        steps.push(step('Verification timed out, keeping remaining portfolio unverified'));
        break;
      }

      totalChecks++;
      try {
        const results = await searchWeb(`"${company.name}" "${state.firmName}"`, 3);
        if (results.length > 0) {
          verifiedPortfolio.push({ ...company, verified: true });
          verifiedCount++;
        } else {
          verifiedPortfolio.push({ ...company, verified: false });
          steps.push(step(`Portfolio "${company.name}" — not verified (no co-occurrence)`));
        }
      } catch (err) {
        // Search backend failed — keep the company unverified (same semantic as no co-occurrence).
        log.warn('firmResearch/verify: portfolio verification search failed', { company: company.name, error: err instanceof Error ? err.message : String(err) });
        verifiedPortfolio.push({ ...company, verified: false });
      }
    }

    // Keep unverified ones from beyond the cap
    const remaining = profile.portfolioCompanies.slice(5).map(c => ({ ...c, verified: false }));
    profile.portfolioCompanies = [...verifiedPortfolio, ...remaining];
  }

  // 3. Verify person-firm match
  const updatedPerson = state.personProfile ? { ...state.personProfile } : null;
  if (updatedPerson && state.firmName && updatedPerson.title) {
    totalChecks++;
    // Check if person's name/title co-occurs with firm name in search results
    const personInFirmContext = state.personSearchResults?.toLowerCase().includes(state.firmName.toLowerCase());
    if (personInFirmContext) {
      updatedPerson.verified = true;
      verifiedCount++;
      steps.push(step('Person-firm match verified'));
    } else {
      updatedPerson.verified = false;
      steps.push(step('Person-firm match NOT verified — person may not work at this firm'));
    }
  }

  // 4. Verify sectors have source backing
  if (profile.sectors.length > 0) {
    totalChecks++;
    const allText = ((state.websiteText || '') + ' ' + (state.firmSearchResults || '')).toLowerCase();
    const verifiedSectors = profile.sectors.filter(sector =>
      allText.includes(sector.toLowerCase())
    );
    const droppedSectors = profile.sectors.filter(s => !verifiedSectors.includes(s));

    if (droppedSectors.length > 0) {
      steps.push(step(`Dropped ${droppedSectors.length} unverified sectors`, droppedSectors.join(', ')));
    }
    if (verifiedSectors.length > 0) {
      verifiedCount++;
    }
    profile.sectors = verifiedSectors;
  }

  // Set confidence level
  const ratio = totalChecks > 0 ? verifiedCount / totalChecks : 0;
  if (ratio >= 0.7) {
    profile.confidence = 'high';
  } else if (ratio >= 0.4) {
    profile.confidence = 'medium';
  } else {
    profile.confidence = 'low';
  }

  steps.push(step(`Verification complete: ${verifiedCount}/${totalChecks} checks passed`, `confidence: ${profile.confidence}`));

  log.info('Firm research: verification complete', {
    firmName: state.firmName,
    confidence: profile.confidence,
    verified: verifiedCount,
    total: totalChecks,
  });

  return {
    firmProfile: profile,
    personProfile: updatedPerson,
    status: 'saving',
    steps,
  };
}
