// Shapes returned by POST /api/onboarding/enrich-firm (new endpoint
// added on main in the firmResearchAgent work). Kept as a shared type
// so the firm task + profile report modal stay in sync.

export interface FirmProfile {
  description?: string;
  strategy?: string;
  sectors?: string[];
  checkSizeRange?: string;
  aum?: string;
  teamSize?: string;
  headquarters?: string;
  foundedYear?: string | number;
  investmentCriteria?: string;
  keyDifferentiators?: string;
  portfolioCompanies?: Array<{ name: string; sector?: string; status?: "exited" | "active"; verified?: boolean }>;
  recentDeals?: Array<{ title: string; date?: string }>;
  sources?: string[];
  confidence?: "high" | "medium" | "low";
}

export interface PersonProfile {
  title?: string;
  role?: string;
  bio?: string;
  education?: string;
  yearsInPE?: string | number;
  expertise?: string[];
  experience?: string[];
  notableDeals?: string[];
}

export interface EnrichmentResponse {
  success: boolean;
  firmProfile?: FirmProfile;
  personProfile?: PersonProfile;
  steps?: Array<{ node: string; message: string; detail?: string }>;
  error?: string;
}

// Map profile.checkSizeRange / aum string into our 4 AUM buttons.
// Mirrors applyEnrichmentToForm in apps/web/js/onboarding/onboarding-tasks.js.
export function matchAumBucket(profile: FirmProfile): string | null {
  const raw = (profile.checkSizeRange || profile.aum || "").toLowerCase();
  if (!raw) return null;
  if (raw.includes("1b") || raw.includes("billion")) return "$1B+";
  if (raw.includes("500m") || raw.includes("500")) return "$500M-1B";
  if (raw.includes("100m") || raw.includes("100")) return "$100-500M";
  return "<$100M";
}

// Translate raw sector keywords from enrichment to our canonical labels.
const SECTOR_KEYWORDS: Array<[string, string]> = [
  ["healthcare", "Healthcare"],
  ["industrials", "Industrials"],
  ["software", "Software"],
  ["consumer", "Consumer"],
  ["financial", "Financial"],
  ["tech", "Tech-enabled services"],
  ["energy", "Energy"],
];

export function matchSectors(profile: FirmProfile): string[] {
  if (!profile.sectors || profile.sectors.length === 0) return [];
  const matches = new Set<string>();
  for (const s of profile.sectors) {
    const lower = s.toLowerCase();
    for (const [key, label] of SECTOR_KEYWORDS) {
      if (lower.includes(key)) matches.add(label);
    }
  }
  return [...matches];
}
