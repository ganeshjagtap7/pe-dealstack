// Orchestrates LegalDocument lifecycle around Google Drive + Docs.
// Routes (routes/legal-documents.ts) are a thin shell on top of these
// functions. Throws LegalDocError with a `code` the route layer maps
// onto the documented frontend error codes; anything else bubbles as 500.

import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import {
  copyDoc,
  createBlankDoc,
  batchUpdateDocPlaceholders,
  addPermission,
  trashFile,
  ensureFolderExists,
} from '../integrations/googleDrive/client.js';
import {
  ensureFreshAccessToken,
  findUserDriveIntegration,
} from '../integrations/googleDrive/index.js';

export type LegalDocErrorCode =
  | 'DRIVE_NOT_CONNECTED'
  | 'DRIVE_FOLDER_NOT_CONFIGURED'
  | 'DRIVE_API_ERROR'
  | 'TEMPLATE_NOT_FOUND'
  | 'DEAL_NOT_FOUND'
  | 'ORG_NOT_FOUND';

export class LegalDocError extends Error {
  code: LegalDocErrorCode;
  status: number;
  details?: string;
  constructor(code: LegalDocErrorCode, message: string, status: number, details?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const PLACEHOLDER_KEYS = [
  'COUNTERPARTY',
  'COUNTERPARTY_EMAIL',
  'DEAL_NAME',
  'EFFECTIVE_DATE',
  'FIRM_NAME',
] as const;

export type PlaceholderKey = (typeof PLACEHOLDER_KEYS)[number];

interface DealRow {
  id: string;
  organizationId: string;
  name: string | null;
  companyName: string | null;
}

interface OrgRow {
  id: string;
  name: string | null;
  googleDriveFolderId: string | null;
  googleDriveTemplatesFolderId: string | null;
}

interface TemplateRow {
  id: string;
  organizationId: string;
  googleDocId: string;
  docType: string;
  placeholderMap: Record<string, string> | null;
}

// ============================================================
// Inputs
// ============================================================

export interface CreateFromTemplateInput {
  mode: 'fromTemplate';
  templateId: string;
  title: string;
  counterpartyName?: string;
  counterpartyEmail?: string;
  effectiveDate?: string; // ISO YYYY-MM-DD
}

export interface CreateBlankInput {
  mode: 'blank';
  title: string;
  docType?: string;
  counterpartyName?: string;
  counterpartyEmail?: string;
  effectiveDate?: string;
}

export type CreateDocumentInput = CreateFromTemplateInput | CreateBlankInput;

export interface CreateDocumentContext {
  organizationId: string;
  dealId: string;
  internalUserId: string;
}

// ============================================================
// Internals
// ============================================================

async function loadOrg(orgId: string): Promise<OrgRow> {
  const { data, error } = await supabase
    .from('Organization')
    .select('id, name, googleDriveFolderId, googleDriveTemplatesFolderId')
    .eq('id', orgId)
    .single();
  if (error || !data) {
    throw new LegalDocError('ORG_NOT_FOUND', 'Organization not found', 404, error?.message);
  }
  return data as OrgRow;
}

async function loadDeal(dealId: string, orgId: string): Promise<DealRow> {
  const { data, error } = await supabase
    .from('Deal')
    .select('id, organizationId, name, companyName')
    .eq('id', dealId)
    .eq('organizationId', orgId)
    .single();
  if (error || !data) {
    throw new LegalDocError('DEAL_NOT_FOUND', 'Deal not found', 404, error?.message);
  }
  return data as DealRow;
}

async function loadTemplate(templateId: string, orgId: string): Promise<TemplateRow> {
  const { data, error } = await supabase
    .from('LegalDocTemplate')
    .select('id, organizationId, googleDocId, docType, placeholderMap')
    .eq('id', templateId)
    .eq('organizationId', orgId)
    .maybeSingle();
  if (error) {
    throw new LegalDocError('DRIVE_API_ERROR', 'Failed to load template', 502, error.message);
  }
  if (!data) throw new LegalDocError('TEMPLATE_NOT_FOUND', 'Template not found', 404);
  return data as TemplateRow;
}

async function getDriveAccess(ctx: CreateDocumentContext): Promise<string> {
  const integration = await findUserDriveIntegration(ctx.internalUserId, ctx.organizationId);
  if (!integration) {
    throw new LegalDocError('DRIVE_NOT_CONNECTED', 'Connect Google Drive to create legal documents', 409);
  }
  try {
    return await ensureFreshAccessToken(integration);
  } catch (err) {
    throw new LegalDocError('DRIVE_NOT_CONNECTED', 'Google Drive token expired — reconnect required', 409,
      err instanceof Error ? err.message : String(err));
  }
}

// One folder per deal under the org's Legal Docs folder. If the org has
// no folder configured we degrade to "no parent" (Drive treats this as
// My-Drive root) rather than throwing — the admin can pin a Shared
// Drive ID later and subsequent creates will use it.
async function resolveDealFolder(
  accessToken: string,
  org: OrgRow,
  deal: DealRow,
): Promise<string | null> {
  if (!org.googleDriveFolderId) {
    log.warn('legalDocService: org has no googleDriveFolderId, creating at root', { organizationId: org.id });
    return null;
  }
  const dealFolderName = (deal.name ?? deal.companyName ?? deal.id).slice(0, 100);
  try {
    const folder = await ensureFolderExists(accessToken, org.googleDriveFolderId, dealFolderName);
    return folder.id;
  } catch (err) {
    throw new LegalDocError('DRIVE_API_ERROR', 'Failed to resolve deal folder in Drive', 502,
      err instanceof Error ? err.message : String(err));
  }
}

function buildPlaceholderValues(params: {
  org: OrgRow;
  deal: DealRow;
  input: CreateDocumentInput;
}): Record<PlaceholderKey, string> {
  const { org, deal, input } = params;
  return {
    COUNTERPARTY: input.counterpartyName ?? '',
    COUNTERPARTY_EMAIL: input.counterpartyEmail ?? '',
    DEAL_NAME: deal.name ?? deal.companyName ?? '',
    EFFECTIVE_DATE: formatEffectiveDate(input.effectiveDate),
    FIRM_NAME: org.name ?? '',
  };
}

function formatEffectiveDate(iso?: string): string {
  if (!iso) return '';
  // Preserve YYYY-MM-DD so downstream signing tools that parse rendered
  // docs stay predictable. Frontend can localize display separately.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : iso;
}

// Translate the (org, deal, input) tuple into the replacements map the
// Docs batchUpdate API expects, honouring per-template placeholder
// overrides. placeholderMap is { [PLACEHOLDER_KEY]: '[CUSTOM_TOKEN]' }
// — e.g. { COUNTERPARTY: '[PARTY_B]' } makes us search for [PARTY_B]
// instead of [COUNTERPARTY].
function buildReplacements(
  values: Record<PlaceholderKey, string>,
  placeholderMap: Record<string, string> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PLACEHOLDER_KEYS) {
    const token = placeholderMap?.[key] ?? `[${key}]`;
    out[token] = values[key];
  }
  return out;
}

async function listDealTeamEmails(dealId: string): Promise<string[]> {
  // Deal team membership lives on DealTeamMember with a User FK.
  const { data, error } = await supabase
    .from('DealTeamMember')
    .select('user:User(email)')
    .eq('dealId', dealId);
  if (error) {
    log.warn('legalDocService: failed to load deal team for ACLs', {
      dealId,
      message: error.message,
    });
    return [];
  }
  const rows = (data ?? []) as Array<{ user: { email?: string | null } | null }>;
  const seen = new Set<string>();
  for (const row of rows) {
    const email = row.user?.email?.toLowerCase().trim();
    if (email) seen.add(email);
  }
  return Array.from(seen);
}

async function grantAcls(params: {
  accessToken: string;
  fileId: string;
  emails: string[];
}): Promise<{ granted: string[]; failures: Array<{ email: string; error: string }> }> {
  const granted: string[] = [];
  const failures: Array<{ email: string; error: string }> = [];
  for (const email of params.emails) {
    try {
      await addPermission(params.accessToken, params.fileId, email, 'writer');
      granted.push(email);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ email, error: msg });
      log.warn('legalDocService: ACL grant failed (continuing)', {
        fileId: params.fileId,
        email,
        message: msg,
      });
    }
  }
  return { granted, failures };
}

interface InsertRow {
  organizationId: string;
  dealId: string;
  createdById: string | null;
  docType: string;
  title: string;
  counterpartyName: string | null;
  counterpartyEmail: string | null;
  status: 'DRAFT';
  googleDocId: string;
  googleDocUrl: string;
  googleDriveFolderId: string | null;
  templateId: string | null;
  effectiveDate: string | null;
  metadata: Record<string, unknown>;
  lastSyncedAt: string;
}

// ============================================================
// Public entry points
// ============================================================

export interface CreateDocumentResult {
  id: string;
  googleDocId: string;
  googleDocUrl: string;
  grantedAcls: string[];
  aclFailures: Array<{ email: string; error: string }>;
}

export async function createDocument(
  input: CreateDocumentInput,
  ctx: CreateDocumentContext,
): Promise<CreateDocumentResult> {
  const [org, deal] = await Promise.all([
    loadOrg(ctx.organizationId),
    loadDeal(ctx.dealId, ctx.organizationId),
  ]);

  // Optional template lookup (fail fast on missing before we touch
  // Drive, so 404s come back without making Drive calls).
  let template: TemplateRow | null = null;
  if (input.mode === 'fromTemplate') {
    template = await loadTemplate(input.templateId, ctx.organizationId);
  }

  const accessToken = await getDriveAccess(ctx);
  const dealFolderId = await resolveDealFolder(accessToken, org, deal);

  // Create the Doc.
  let googleDocId: string;
  let googleDocUrl: string;
  try {
    if (input.mode === 'fromTemplate' && template) {
      const copied = await copyDoc(accessToken, template.googleDocId, dealFolderId, input.title);
      googleDocId = copied.id;
      googleDocUrl = copied.webViewLink;
    } else {
      const created = await createBlankDoc(accessToken, dealFolderId, input.title);
      googleDocId = created.id;
      googleDocUrl = created.webViewLink;
    }
  } catch (err) {
    throw new LegalDocError(
      'DRIVE_API_ERROR',
      'Failed to create Drive document',
      502,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Placeholder substitution (template mode only). Best-effort — if
  // the doc was copied successfully but the Docs API rejects our
  // batchUpdate, we keep the doc and surface the error in metadata so
  // the user can repair it manually.
  let placeholderError: string | null = null;
  if (input.mode === 'fromTemplate' && template) {
    const values = buildPlaceholderValues({ org, deal, input });
    const replacements = buildReplacements(values, template.placeholderMap);
    try {
      await batchUpdateDocPlaceholders(accessToken, googleDocId, replacements);
    } catch (err) {
      placeholderError = err instanceof Error ? err.message : String(err);
      log.warn('legalDocService: placeholder substitution failed (keeping doc)', {
        googleDocId,
        message: placeholderError,
      });
    }
  }

  // Drive ACLs — grant writer to every deal team member by email.
  const teamEmails = await listDealTeamEmails(ctx.dealId);
  const acl = await grantAcls({ accessToken, fileId: googleDocId, emails: teamEmails });

  // Resolve docType (template wins, falls back to input or NDA default)
  const docType =
    (template?.docType as string | undefined) ??
    (input.mode === 'blank' && input.docType ? input.docType : 'NDA');

  // Persist.
  const insertRow: InsertRow = {
    organizationId: ctx.organizationId,
    dealId: ctx.dealId,
    createdById: ctx.internalUserId,
    docType,
    title: input.title,
    counterpartyName: input.counterpartyName ?? null,
    counterpartyEmail: input.counterpartyEmail ?? null,
    status: 'DRAFT',
    googleDocId,
    googleDocUrl,
    googleDriveFolderId: dealFolderId,
    templateId: template?.id ?? null,
    effectiveDate: input.effectiveDate ?? null,
    metadata: {
      placeholderError,
      aclFailures: acl.failures.length > 0 ? acl.failures : undefined,
    },
    lastSyncedAt: new Date().toISOString(),
  };

  const { data: row, error: insertErr } = await supabase
    .from('LegalDocument')
    .insert(insertRow)
    .select('*')
    .single();

  if (insertErr || !row) {
    // DB insert failed — orphan cleanup. Trash the doc so we don't
    // leave stranded files in the user's Drive on retry. Trash failure
    // is best-effort because the doc is at least recoverable manually.
    try {
      await trashFile(accessToken, googleDocId);
    } catch (cleanupErr) {
      log.error('legalDocService: orphan cleanup failed after DB insert error', cleanupErr, {
        googleDocId,
        dealId: ctx.dealId,
      });
    }
    throw new LegalDocError(
      'DRIVE_API_ERROR',
      'Failed to persist legal document',
      500,
      insertErr?.message,
    );
  }

  return {
    id: row.id as string,
    googleDocId,
    googleDocUrl,
    grantedAcls: acl.granted,
    aclFailures: acl.failures,
  };
}

// Re-apply ACLs from the current deal team. Used by the
// POST /legal-documents/:id/reshare endpoint — when someone joins the
// deal team after the doc was created they don't get retroactive
// access until this is called.
export async function reshareDocument(params: {
  internalUserId: string;
  organizationId: string;
  documentId: string;
}): Promise<{ granted: string[]; failures: Array<{ email: string; error: string }> }> {
  const { internalUserId, organizationId, documentId } = params;
  const { data: doc, error } = await supabase
    .from('LegalDocument')
    .select('id, dealId, googleDocId, organizationId')
    .eq('id', documentId)
    .maybeSingle();
  if (error) {
    throw new LegalDocError('DRIVE_API_ERROR', 'Failed to load document', 502, error.message);
  }
  if (!doc || doc.organizationId !== organizationId) {
    throw new LegalDocError('DEAL_NOT_FOUND', 'Document not found', 404);
  }
  const accessToken = await getDriveAccess({
    organizationId,
    dealId: doc.dealId as string,
    internalUserId,
  });
  const emails = await listDealTeamEmails(doc.dealId as string);
  return grantAcls({ accessToken, fileId: doc.googleDocId as string, emails });
}

// Extract a Doc ID from either a raw ID or a docs.google.com URL.
// Tolerant by design — admin paste-template flow shouldn't fail because
// the user copied a /edit or /view URL.
export function extractGoogleDocId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  // URL form: https://docs.google.com/document/d/{ID}/edit
  const urlMatch = /\/document\/d\/([a-zA-Z0-9_-]{10,})/.exec(trimmed);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  // Bare ID form
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}
