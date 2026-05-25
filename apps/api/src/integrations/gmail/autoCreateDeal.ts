import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';
import { extractDealDataFromText, type ExtractedDealData } from '../../services/aiExtractor.js';
import { validateFinancials } from '../../services/financialValidator.js';
import { getIconForIndustry } from '../../services/dealMerger.js';
import { embedDocument } from '../../rag.js';

// Source tags used on Deal.source so downstream UI can distinguish how a deal
// was created. Keep these in sync with any UI badge logic.
export type DealCreateSource = 'manual_eml' | 'ai_email_gmail';

export interface AutoCreateDealInput {
  organizationId: string;
  userId: string | null;        // owner; null if no human triggered this
  source: DealCreateSource;
  email: {
    subject: string;
    from: string;              // free-form "Name <email>" or "email"
    date: Date;
    bodyText: string;
  };
  // Gmail-specific provenance (omitted for manual .eml uploads).
  threadId?: string | null;
  messageId?: string | null;
  integrationActivityId?: string | null;
}

export interface AutoCreateDealResult {
  created: boolean;
  reason?: 'duplicate' | 'insufficient_content' | 'extraction_failed' | 'no_company_name';
  dealId?: string;
  documentId?: string;
  extraction?: ExtractedDealData;
  companyName?: string;
}

const MIN_BODY_CHARS = 100;

function buildDealText(email: AutoCreateDealInput['email']): string {
  return [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    `Date: ${email.date.toISOString().split('T')[0]}`,
    `---`,
    '',
    email.bodyText,
  ].join('\n');
}

/**
 * Idempotent: if a Deal with the same (organizationId, sourceMessageId) already
 * exists, returns `{ created: false, reason: 'duplicate' }` without writing.
 *
 * The route handler at /api/ingest/email and the Gmail cron sync both call this.
 * Side-effects: writes to Company / Deal / Document / Activity, fires RAG
 * embedding in the background. Audit logging is the caller's responsibility
 * (route layer needs `req`; cron path has no `req`).
 */
export async function createDealFromEmail(
  input: AutoCreateDealInput
): Promise<AutoCreateDealResult> {
  const { organizationId, userId, source, email, threadId, messageId, integrationActivityId } = input;

  // 1. Idempotency check — same Gmail message must never create two deals.
  if (messageId) {
    const { data: existing } = await supabase
      .from('Deal')
      .select('id')
      .eq('organizationId', organizationId)
      .eq('sourceMessageId', messageId)
      .maybeSingle();
    if (existing?.id) {
      return { created: false, reason: 'duplicate', dealId: existing.id };
    }
  }

  // 2. Build text for AI extraction.
  const dealText = buildDealText(email);
  if (dealText.length < MIN_BODY_CHARS) {
    return { created: false, reason: 'insufficient_content' };
  }

  // 3. AI extraction.
  const aiData = await extractDealDataFromText(dealText);
  if (!aiData) {
    return { created: false, reason: 'extraction_failed' };
  }

  // 4. Financial sanity check — may flip needsReview.
  const financialCheck = validateFinancials({
    revenue: aiData.revenue.value,
    ebitda: aiData.ebitda.value,
    ebitdaMargin: aiData.ebitdaMargin?.value,
    revenueGrowth: aiData.revenueGrowth?.value,
    employees: aiData.employees?.value,
  });
  if (!financialCheck.isValid) {
    aiData.needsReview = true;
    aiData.reviewReasons = [...(aiData.reviewReasons || []), ...financialCheck.warnings];
  }

  // 5. Resolve company name — fall back to subject if AI didn't find one.
  // For the Gmail flow we refuse to create a deal with subject-as-name (too
  // noisy); manual upload preserves the existing fallback for back-compat.
  const extractedName = aiData.companyName.value;
  let companyName = extractedName || email.subject;
  if (source === 'ai_email_gmail' && !extractedName) {
    return { created: false, reason: 'no_company_name' };
  }
  companyName = companyName.trim();

  // 6. Find-or-create Company (case-insensitive name match within org).
  const { data: existingCompany } = await supabase
    .from('Company')
    .select('id, name')
    .ilike('name', companyName)
    .eq('organizationId', organizationId)
    .maybeSingle();

  let company: { id: string; name: string };
  if (existingCompany) {
    company = existingCompany;
  } else {
    const { data: newCompany, error: companyError } = await supabase
      .from('Company')
      .insert({
        name: companyName,
        industry: aiData.industry.value,
        description: aiData.description.value,
        organizationId,
      })
      .select('id, name')
      .single();
    if (companyError || !newCompany) {
      throw new Error(`createDealFromEmail: company insert failed — ${companyError?.message ?? 'no row'}`);
    }
    company = newCompany;
  }

  // 7. Create the Deal with full provenance.
  const dealIcon = getIconForIndustry(aiData.industry.value);
  const dealStatus = aiData.needsReview ? 'PENDING_REVIEW' : 'ACTIVE';

  const dealRow: Record<string, unknown> = {
    name: companyName,
    companyId: company.id,
    organizationId,
    stage: 'INITIAL_REVIEW',
    status: dealStatus,
    industry: aiData.industry.value,
    description: aiData.description.value,
    revenue: aiData.revenue.value,
    ebitda: aiData.ebitda.value,
    dealSize: aiData.dealSize?.value ?? aiData.revenue.value,
    aiThesis: aiData.summary,
    icon: dealIcon,
    extractionConfidence: aiData.overallConfidence,
    needsReview: aiData.needsReview,
    reviewReasons: aiData.reviewReasons,
    aiRisks: {
      keyRisks: aiData.keyRisks || [],
      investmentHighlights: aiData.investmentHighlights || [],
    },
    source: source === 'manual_eml' ? 'email' : 'ai_email_gmail',
    sourceConfidence: aiData.overallConfidence,
    sourceMessageId: messageId ?? null,
    sourceThreadIds: threadId ? [threadId] : [],
  };

  const { data: deal, error: dealError } = await supabase
    .from('Deal')
    .insert(dealRow)
    .select('id')
    .single();

  if (dealError || !deal) {
    // Unique constraint on (organizationId, sourceMessageId) — race condition
    // with a parallel cron tick. Treat as duplicate.
    if (dealError?.code === '23505') {
      const { data: dup } = await supabase
        .from('Deal')
        .select('id')
        .eq('organizationId', organizationId)
        .eq('sourceMessageId', messageId ?? '')
        .maybeSingle();
      if (dup?.id) return { created: false, reason: 'duplicate', dealId: dup.id };
    }
    throw new Error(`createDealFromEmail: deal insert failed — ${dealError?.message ?? 'no row'}`);
  }

  // 8. Persist the email body as a Document on the deal (matches existing pattern).
  const { data: document } = await supabase
    .from('Document')
    .insert({
      dealId: deal.id,
      name: `Email — ${email.subject}`,
      type: 'OTHER',
      extractedText: dealText,
      extractedData: {
        companyName: aiData.companyName,
        industry: aiData.industry,
        description: aiData.description,
        revenue: aiData.revenue,
        ebitda: aiData.ebitda,
        ebitdaMargin: aiData.ebitdaMargin,
        revenueGrowth: aiData.revenueGrowth,
        employees: aiData.employees,
        summary: aiData.summary,
        overallConfidence: aiData.overallConfidence,
        needsReview: aiData.needsReview,
        reviewReasons: aiData.reviewReasons,
      },
      status: aiData.needsReview ? 'pending_review' : 'analyzed',
      confidence: aiData.overallConfidence / 100,
      aiAnalyzedAt: new Date().toISOString(),
      mimeType: 'message/rfc822',
    })
    .select('id')
    .single();

  // 9. Activity record so the Deal's audit trail explains who/what created it.
  await supabase.from('Activity').insert({
    dealId: deal.id,
    type: 'DEAL_CREATED',
    title:
      source === 'ai_email_gmail'
        ? 'Deal auto-created from Gmail'
        : 'Deal created from email',
    description: `From: ${email.from}\nSubject: ${email.subject}`,
    metadata: {
      source,
      emailFrom: email.from,
      emailSubject: email.subject,
      emailDate: email.date.toISOString(),
      threadId: threadId ?? null,
      messageId: messageId ?? null,
      integrationActivityId: integrationActivityId ?? null,
      extractionConfidence: aiData.overallConfidence,
    },
  });

  // 10. Auto-assign the inbox owner as the deal owner / first team member.
  if (userId) {
    await supabase.from('DealTeamMember').insert({
      dealId: deal.id,
      userId,
      role: 'MEMBER',
    });
  }

  // 11. RAG-embed in the background. Failures must not break deal creation.
  if (dealText.length > MIN_BODY_CHARS) {
    embedDocument(document?.id || deal.id, deal.id, dealText).catch(err =>
      log.error('createDealFromEmail: RAG embed failed (non-fatal)', err)
    );
  }

  log.info('createDealFromEmail: deal created', {
    dealId: deal.id,
    source,
    companyName,
    confidence: aiData.overallConfidence,
    threadId,
    messageId,
  });

  return {
    created: true,
    dealId: deal.id,
    documentId: document?.id,
    extraction: aiData,
    companyName,
  };
}
