// ─── Firm Teaser shared contract types ───────────────────────────────
// These shapes are part of the cross-app contract — the web-next frontend is
// built against them. Keep them in one place so the service + generator agree.
//
// Config stored at Organization.settings.firmTeaser:
//   FirmTeaserConfig = { profiles: TeaserProfile[] }

export type TeaserCriterion = { id: string; label: string; value: string };

export type TeaserProfile = {
  id: string;
  name: string;
  systemPrompt: string;
  criteria: TeaserCriterion[];
  updatedAt: string;
};

export type FirmTeaserConfig = { profiles: TeaserProfile[] };

export type TeaserVerdict = 'fit' | 'partial' | 'miss';

export type TeaserFit = { criterion: string; verdict: TeaserVerdict; note: string };

export type DealTeaser = {
  id: string;
  dealId: string;
  profileId: string;
  profileName?: string;
  headline: string;
  fits: TeaserFit[];
  stale: boolean;
  model: string;
  generatedAt: string;
};
