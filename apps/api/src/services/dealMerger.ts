/**
 * Shared Deal Merger Service
 * Merges AI-extracted data into existing deals with confidence-based logic.
 * Used by both ingest.ts and documents.ts upload flows.
 */

import { supabase } from '../supabase.js';
import { ExtractedDealData } from './aiExtractor.js';
import { log } from '../utils/logger.js';

// Map document type icons
const industryIcons: Record<string, string> = {
  'Healthcare': 'monitor_heart',
  'Healthcare Services': 'monitor_heart',
  'Technology': 'memory',
  'Software': 'code',
  'SaaS': 'cloud',
  'Enterprise Software': 'cloud',
  'Cloud Infrastructure': 'cloud_queue',
  'Manufacturing': 'precision_manufacturing',
  'Industrial Manufacturing': 'precision_manufacturing',
  'Transportation': 'local_shipping',
  'Logistics': 'webhook',
  'Supply Chain': 'webhook',
  'Financial Services': 'account_balance',
  'Retail': 'storefront',
  'E-commerce': 'shopping_cart',
  'Energy': 'bolt',
  'Real Estate': 'home_work',
  'Consumer': 'shopping_bag',
  'Food & Beverage': 'restaurant',
  'Education': 'school',
};

export function getIconForIndustry(industry: string | null): string {
  if (!industry) return 'business_center';

  // Check for exact match first
  if (industryIcons[industry]) return industryIcons[industry];

  // Check for partial match
  const lowerIndustry = industry.toLowerCase();
  for (const [key, icon] of Object.entries(industryIcons)) {
    if (lowerIndustry.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerIndustry)) {
      return icon;
    }
  }

  return 'business_center';
}

/**
 * Merge AI-extracted data into an existing deal.
 * Updates financial fields only when new extraction has higher confidence or existing is null.
 * Returns the updated deal.
 */
export async function mergeIntoExistingDeal(
  dealId: string,
  aiData: ExtractedDealData,
  userId: string | undefined,
  sourceName: string,
): Promise<{ deal: any; isNew: false }> {
  // Fetch existing deal
  const { data: existingDeal, error: fetchErr } = await supabase
    .from('Deal')
    .select('*, company:Company(*)')
    .eq('id', dealId)
    .single();

  if (fetchErr || !existingDeal) {
    throw new Error('Deal not found');
  }

  // Build update object — only override fields where new data is better
  const updates: Record<string, any> = {
    lastDocument: sourceName,
    lastDocumentUpdated: new Date().toISOString(),
  };

  const existingConf = existingDeal.extractionConfidence || 0;

  // Merge each financial field: update if existing is null or new confidence is higher
  if (aiData.revenue.value != null && (existingDeal.revenue == null || aiData.revenue.confidence > existingConf)) {
    updates.revenue = aiData.revenue.value;
    updates.dealSize = aiData.revenue.value;
  }
  if (aiData.ebitda.value != null && (existingDeal.ebitda == null || aiData.ebitda.confidence > existingConf)) {
    updates.ebitda = aiData.ebitda.value;
  }
  if (aiData.industry.value && (!existingDeal.industry || aiData.industry.confidence > existingConf)) {
    updates.industry = aiData.industry.value;
    updates.icon = getIconForIndustry(aiData.industry.value);
  }
  if (aiData.description.value && aiData.description.value !== 'No description available' && (!existingDeal.description || aiData.description.confidence > existingConf)) {
    updates.description = aiData.description.value;
  }
  if (aiData.summary && (!existingDeal.aiThesis || aiData.overallConfidence > existingConf)) {
    updates.aiThesis = aiData.summary;
  }

  // Merge risks/highlights (append new unique items)
  const existingRisks = existingDeal.aiRisks || { keyRisks: [], investmentHighlights: [] };
  const mergedKeyRisks = [...new Set([...(existingRisks.keyRisks || []), ...(aiData.keyRisks || [])])];
  const mergedHighlights = [...new Set([...(existingRisks.investmentHighlights || []), ...(aiData.investmentHighlights || [])])];
  updates.aiRisks = { keyRisks: mergedKeyRisks, investmentHighlights: mergedHighlights };

  // Update confidence to the higher of old vs new
  if (aiData.overallConfidence > existingConf) {
    updates.extractionConfidence = aiData.overallConfidence;
  }

  // Clear needsReview if new extraction is confident
  if (!aiData.needsReview && existingDeal.needsReview) {
    updates.needsReview = false;
    updates.reviewReasons = [];
    updates.status = 'ACTIVE';
  }

  const { data: updatedDeal, error: updateErr } = await supabase
    .from('Deal')
    .update(updates)
    .eq('id', dealId)
    .select('*, company:Company(*)')
    .single();

  if (updateErr) throw updateErr;

  // Log activity
  await supabase.from('Activity').insert({
    dealId,
    type: 'DOCUMENT_ADDED',
    title: `New document added: ${sourceName}`,
    description: `Additional data ingested into "${existingDeal.name}" with ${aiData.overallConfidence}% confidence`,
    metadata: {
      sourceName,
      overallConfidence: aiData.overallConfidence,
      fieldsUpdated: Object.keys(updates).filter(k => k !== 'lastDocument' && k !== 'lastDocumentUpdated'),
    },
  });

  return { deal: updatedDeal, isNew: false };
}
