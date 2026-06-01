// Exact-string token replacement for NDA bodies. Real templates use
// VISUAL whitespace gaps for fillable fields, not bracket markers —
// the admin manually wraps the gaps in [TOKEN] markers during the
// verify step, and this service then swaps them for the live values.
//
// No regex, no fuzzy matching: replaceAll with the literal `[TOKEN]`
// string. This keeps substitution predictable and survives templates
// that contain regex metacharacters in their copy.

export const LEGAL_DOC_TOKEN_KEYS = [
  'COUNTERPARTY_NAME',
  'COUNTERPARTY_ADDRESS',
  'COUNTERPARTY_EMAIL',
  'EFFECTIVE_DATE',
  'JURISDICTION',
  'DEAL_NAME',
  'FIRM_NAME',
  'TODAY',
] as const;

export type LegalDocTokenKey = (typeof LEGAL_DOC_TOKEN_KEYS)[number];

export type LegalDocTokenValues = Partial<Record<LegalDocTokenKey, string>>;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Formats a YYYY-MM-DD string (or any ISO-ish date input) as
// "Month DD, YYYY". Returns the original input on parse failure
// so we never silently drop a value the admin typed in.
export function formatLongDate(input: string | undefined | null): string {
  if (!input) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!m) return input;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!month || month < 1 || month > 12) return input;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function substituteTokens(
  bodyHtml: string,
  tokens: LegalDocTokenValues,
): string {
  let out = bodyHtml;
  for (const key of LEGAL_DOC_TOKEN_KEYS) {
    const raw = tokens[key] ?? '';
    const value = key === 'EFFECTIVE_DATE' || key === 'TODAY'
      ? formatLongDate(raw)
      : raw;
    out = out.replaceAll(`[${key}]`, value);
  }
  return out;
}
