import type { HubSpotRecord, MappedCompany, MappedContact, MappedDeal } from './types.js';

// Property keys we promote to first-class columns; everything else → hubspotProperties.
const COMPANY_STD = new Set(['name', 'industry', 'domain', 'description']);
const CONTACT_STD = new Set(['firstname', 'lastname', 'email', 'phone', 'jobtitle']);
const DEAL_STD = new Set(['dealname', 'amount']);

function rest(properties: Record<string, string | null>, std: Set<string>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(properties)) {
    if (!std.has(k)) out[k] = v;
  }
  return out;
}

export function mapCompany(r: HubSpotRecord): MappedCompany {
  const p = r.properties;
  return {
    hubspotId: r.id,
    name: p.name?.trim() || 'Unknown Company',
    industry: p.industry || null,
    website: p.domain || null,
    description: p.description || null,
    hubspotProperties: rest(p, COMPANY_STD),
  };
}

export function mapContact(r: HubSpotRecord, companyName: string | null): MappedContact {
  const p = r.properties;
  return {
    hubspotId: r.id,
    firstName: p.firstname?.trim() || '',
    lastName: p.lastname?.trim() || '',
    email: p.email || null,
    phone: p.phone || null,
    title: p.jobtitle || null,
    company: companyName,
    hubspotProperties: rest(p, CONTACT_STD),
  };
}

export function mapDeal(r: HubSpotRecord): MappedDeal {
  const p = r.properties;
  const amount = p.amount != null && p.amount !== '' ? Number(p.amount) : null;
  const customFields: Record<string, unknown> = { source: 'hubspot' };
  if (p.dealstage) customFields.dealstage = p.dealstage;
  if (p.pipeline) customFields.pipeline = p.pipeline;
  return {
    hubspotId: r.id,
    name: p.dealname?.trim() || 'Untitled HubSpot Deal',
    dealSize: amount != null && Number.isFinite(amount) ? amount : null,
    description: p.description || null,
    associatedCompanyHubspotId: r.associations?.companies?.results?.[0]?.id ?? null,
    customFields,
    hubspotProperties: rest(p, DEAL_STD),
  };
}
