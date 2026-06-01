// Shared loaders for LegalDocument send/eSignature routes.
//
// Both the route handler (POST /deals/:dealId/legal-documents) and the
// service-layer call sites (legalDocSendService, eSignature handler) need to
// resolve the Deal + Organization rows that drive token substitution
// (DEAL_NAME, FIRM_NAME). Extracting these here keeps the row shape +
// FK-join pattern (Deal -> Company) in one place — same gotcha that broke
// the original cross-deal GET join (Deal has no `companyName` column;
// Company joins via the FK), documented in routes/legal-documents.ts.
//
// The shapes here intentionally mirror what the route file already used so
// the migration is a drop-in swap.

import { supabase } from '../supabase.js';

export interface LegalDocDealRow {
  id: string;
  name: string | null;
  company: { name: string | null } | null;
  organizationId: string;
}

export interface LegalDocOrgRow {
  id: string;
  name: string | null;
}

export async function loadDealForLegalDoc(
  dealId: string,
  orgId: string,
): Promise<LegalDocDealRow | null> {
  const { data, error } = await supabase
    .from('Deal')
    .select('id, name, organizationId, company:Company(name)')
    .eq('id', dealId)
    .eq('organizationId', orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as LegalDocDealRow | null) ?? null;
}

export async function loadOrgForLegalDoc(
  orgId: string,
): Promise<LegalDocOrgRow | null> {
  const { data, error } = await supabase
    .from('Organization')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as LegalDocOrgRow | null) ?? null;
}
