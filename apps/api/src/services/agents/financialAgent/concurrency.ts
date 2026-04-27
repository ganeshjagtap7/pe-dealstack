/**
 * concurrency.ts — Concurrency guard for financial extraction.
 * Limits concurrent extractions per organization to prevent API overload.
 */

const activeExtractions = new Map<string, number>(); // orgId → count
const MAX_CONCURRENT_PER_ORG = 2;

/**
 * Try to acquire an extraction slot for an organization.
 * Returns true if slot acquired, false if at capacity.
 */
export function acquireExtractionSlot(orgId: string): boolean {
  const current = activeExtractions.get(orgId) ?? 0;
  if (current >= MAX_CONCURRENT_PER_ORG) return false;
  activeExtractions.set(orgId, current + 1);
  return true;
}

/**
 * Release an extraction slot for an organization.
 * Always call this in a finally block.
 */
export function releaseExtractionSlot(orgId: string): void {
  const current = activeExtractions.get(orgId) ?? 0;
  if (current <= 1) {
    activeExtractions.delete(orgId);
  } else {
    activeExtractions.set(orgId, current - 1);
  }
}

/**
 * Get current extraction count for an organization.
 */
export function getActiveCount(orgId: string): number {
  return activeExtractions.get(orgId) ?? 0;
}
