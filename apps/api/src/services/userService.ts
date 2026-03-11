import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

/**
 * Find user by authId (or legacy id), or create if not exists.
 * On first signup: also creates the Organization if firmName is provided.
 */
export async function findOrCreateUser(authUser: {
  id: string;
  email: string;
  name?: string;
  firmName?: string;
  role: string;
  user_metadata?: Record<string, unknown>;
}) {
  // Try to find by authId first (include Organization join)
  let { data: userData, error } = await supabase
    .from('User')
    .select('*, organization:Organization(id, name, slug, logo, plan)')
    .eq('authId', authUser.id)
    .single();

  // If not found by authId, try by id (legacy users)
  if (error?.code === 'PGRST116') {
    const result = await supabase
      .from('User')
      .select('*, organization:Organization(id, name, slug, logo, plan)')
      .eq('id', authUser.id)
      .single();
    userData = result.data;
    error = result.error;
  }

  // If still not found, create the user (+ Organization if needed)
  if (error?.code === 'PGRST116') {
    const title = authUser.user_metadata?.title as string | undefined;
    let organizationId: string | null = null;

    // Resolve or create Organization from firmName
    if (authUser.firmName) {
      // Check if Organization with this name already exists
      const { data: existingOrg } = await supabase
        .from('Organization')
        .select('id')
        .eq('name', authUser.firmName)
        .single();

      if (existingOrg) {
        organizationId = existingOrg.id;
      } else {
        // Create new Organization
        const slug = authUser.firmName
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .substring(0, 100);

        const { data: newOrg, error: orgError } = await supabase
          .from('Organization')
          .insert({
            name: authUser.firmName,
            slug: slug || `org-${Date.now()}`,
          })
          .select()
          .single();

        if (orgError) {
          log.error('Failed to create organization', orgError);
          throw orgError;
        }
        organizationId = newOrg.id;
        log.info('Organization created on signup', { orgId: newOrg.id, name: authUser.firmName });
      }
    }

    const { data: newUser, error: createError } = await supabase
      .from('User')
      .insert({
        authId: authUser.id,
        email: authUser.email,
        name: authUser.name || authUser.email?.split('@')[0] || 'User',
        role: authUser.role || 'MEMBER',
        title: title || null,
        firmName: authUser.firmName || null,
        organizationId,
        isActive: true,
      })
      .select('*, organization:Organization(id, name, slug, logo, plan)')
      .single();

    if (createError) throw createError;

    // Set createdBy on Organization if this is the founding user
    if (organizationId) {
      await supabase
        .from('Organization')
        .update({ createdBy: newUser.id })
        .eq('id', organizationId)
        .is('createdBy', null);
    }

    return newUser;
  }

  if (error) throw error;
  return userData;
}
