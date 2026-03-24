import { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';
import { findOrCreateUser } from '../services/userService.js';

/**
 * Organization scoping middleware.
 * Must run after authMiddleware.
 * Resolves the current user's organizationId from the User table.
 * If User record doesn't exist yet (first request after signup),
 * auto-creates User + Organization to eliminate race conditions.
 */
export async function orgMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user?.id) {
      return next();
    }

    // Look up the User record by authId to get organizationId
    const { data: userRecord, error } = await supabase
      .from('User')
      .select('id, organizationId')
      .eq('authId', req.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // User record doesn't exist yet (first request after signup).
      // Auto-create User + Organization to avoid race conditions
      // where parallel API calls hit before /api/users/me creates the record.
      try {
        const newUser = await findOrCreateUser(req.user);
        if (newUser?.organizationId) {
          req.user.organizationId = newUser.organizationId;
        }
      } catch (createErr) {
        log.error('Org middleware: auto-create user failed', createErr);
      }
      return next();
    }

    if (error) {
      log.error('Org middleware: failed to resolve user', error);
    }

    if (userRecord?.organizationId) {
      req.user.organizationId = userRecord.organizationId;
    }

    next();
  } catch (error) {
    log.error('Org middleware error', error);
    next();
  }
}

/**
 * Middleware that REQUIRES organizationId to be resolved.
 * Returns 403 if user has no organization.
 * Use for routes that must be org-scoped.
 */
export function requireOrg(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user?.organizationId) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'You must belong to an organization to access this resource',
    });
    return;
  }
  next();
}

/**
 * Helper to get orgId from request. Throws if not available.
 */
export function getOrgId(req: Request): string {
  const orgId = req.user?.organizationId;
  if (!orgId) {
    throw new Error('Organization ID not available');
  }
  return orgId;
}

/**
 * Verify a deal belongs to the user's organization.
 * Use in deal-child routes (documents, folders, activities, financials).
 * Returns the deal record or null if not found / not in org.
 */
export async function verifyDealAccess(dealId: string, orgId: string) {
  const { data } = await supabase
    .from('Deal')
    .select('id, organizationId')
    .eq('id', dealId)
    .eq('organizationId', orgId)
    .single();
  return data;
}

/**
 * Verify a contact belongs to the user's organization.
 * Returns the contact record or null if not found / not in org.
 */
export async function verifyContactAccess(contactId: string, orgId: string) {
  const { data } = await supabase
    .from('Contact')
    .select('id, organizationId')
    .eq('id', contactId)
    .eq('organizationId', orgId)
    .single();
  return data;
}

/**
 * Verify a document belongs to a deal in the user's organization.
 * Resolves ownership through Document → Deal → organizationId.
 * Returns the document record or null if not found / not in org.
 */
export async function verifyDocumentAccess(documentId: string, orgId: string) {
  const { data: doc } = await supabase
    .from('Document')
    .select('id, dealId')
    .eq('id', documentId)
    .single();
  if (!doc?.dealId) return null;
  const deal = await verifyDealAccess(doc.dealId, orgId);
  return deal ? doc : null;
}

/**
 * Verify a folder belongs to a deal in the user's organization.
 * Resolves ownership through Folder → Deal → organizationId.
 * Returns the folder record or null if not found / not in org.
 */
export async function verifyFolderAccess(folderId: string, orgId: string) {
  const { data: folder } = await supabase
    .from('Folder')
    .select('id, dealId')
    .eq('id', folderId)
    .single();
  if (!folder?.dealId) return null;
  const deal = await verifyDealAccess(folder.dealId, orgId);
  return deal ? folder : null;
}

/**
 * Verify a conversation belongs to a deal in the user's organization.
 * Resolves ownership through Conversation → Deal → organizationId.
 * Returns the conversation record or null if not found / not in org.
 */
export async function verifyConversationAccess(conversationId: string, orgId: string) {
  const { data: conv } = await supabase
    .from('Conversation')
    .select('id, dealId')
    .eq('id', conversationId)
    .single();
  if (!conv?.dealId) return null;
  const deal = await verifyDealAccess(conv.dealId, orgId);
  return deal ? conv : null;
}
