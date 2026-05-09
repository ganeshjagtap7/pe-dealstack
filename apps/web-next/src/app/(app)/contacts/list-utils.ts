import type { Contact } from "./components";

// ─── Constants & helpers shared by contacts/page.tsx ────────────────────────

export const CONTACTS_PAGE_SIZE = 30;

export const SORT_OPTIONS = [
  { sortBy: "createdAt", sortOrder: "desc", label: "Newest First" },
  { sortBy: "createdAt", sortOrder: "asc",  label: "Oldest First" },
  { sortBy: "name",      sortOrder: "asc",  label: "Name A-Z" },
  { sortBy: "name",      sortOrder: "desc", label: "Name Z-A" },
  { sortBy: "company",   sortOrder: "asc",  label: "Company A-Z" },
  { sortBy: "lastContactedAt", sortOrder: "desc", label: "Last Contacted" },
];

// Group contacts by company name, with "No Company" as a fallback bucket.
export function groupContacts(list: Contact[]): Record<string, Contact[]> {
  const groups: Record<string, Contact[]> = {};
  for (const c of list) {
    const key = (c.company || "").trim() || "No Company";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return groups;
}

// Sort the keys of the grouped contacts: "No Company" always at the bottom,
// then by group size descending (matches legacy behavior).
export function sortGroupKeys(grouped: Record<string, Contact[]>): string[] {
  return Object.keys(grouped).sort((a, b) => {
    if (a === "No Company") return 1;
    if (b === "No Company") return -1;
    return grouped[b].length - grouped[a].length;
  });
}
