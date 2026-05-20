// ---------------------------------------------------------------------------
// chart-spec — wire format for chat-embedded charts (Phase 3)
//
// Both the backend `generate_chart` tool and the frontend renderer agree on
// this shape. The agent emits a fenced ```chart block containing minified
// JSON; the renderer extracts those blocks and hands the parsed spec to
// <DealChatChartArtifact>. Persistence is "free" — the spec lives inside the
// chat message body, so a page reload replays the chart from the stored
// transcript without any extra DB columns.
//
// IMPORTANT: this module is consumed by BOTH `apps/web-next` (browser) AND
// `apps/api` (node). Keep it free of node-only imports — no `fs`, no
// `process`, no zod (zod isn't a web-next dep; the API defines its own zod
// schema mirror in tools/generateChart.ts).
// ---------------------------------------------------------------------------

export type ChartType = "line" | "bar" | "waterfall" | "pie";

/**
 * Display unit of the chart's y-values. The agent (or the frontend caller
 * building a spec by hand) sets this to the unit the y-values are already
 * scaled at, so the chart artifact's y-axis ticks honour the right suffix
 * instead of guessing. Default is `"M"` for backward compatibility — every
 * pre-unit spec was implicitly millions of the currency unit.
 *
 *   "K"     — y-values are in thousands  (e.g. 6.9 → "$6.9K")
 *   "M"     — y-values are in millions   (e.g. 2.6 → "$2.6M")
 *   "B"     — y-values are in billions   (e.g. 1.2 → "$1.2B")
 *   "units" — y-values are raw (no scale suffix), e.g. headcount, slice %
 */
export type ChartUnit = "K" | "M" | "B" | "units";

const ALLOWED_UNITS: ReadonlySet<ChartUnit> = new Set<ChartUnit>([
  "K",
  "M",
  "B",
  "units",
]);

export interface ChartPoint {
  x: string | number;
  y: number;
}

export interface ChartSeries {
  name: string;
  data: ChartPoint[];
}

export interface ChartAnnotation {
  x: string | number;
  label: string;
}

export interface ChartSpec {
  type: ChartType;
  title: string;
  xLabel?: string;
  yLabel?: string;
  /**
   * For `pie`: exactly one series whose data points become slices.
   * For `waterfall`: exactly one series; negative `y` values render as
   * decrease bars.
   * For `line`/`bar`: one or more series sharing an x-axis.
   */
  series: ChartSeries[];
  annotations?: ChartAnnotation[];
  /**
   * Magnitude the y-values are already scaled at. Omit (or set to `"M"`)
   * to preserve the legacy display behaviour. When the underlying data
   * is stored in thousands (e.g. the financials pipeline now tags rows
   * as THOUSANDS) the producer MUST set `unit: "K"` so the chart's tick
   * labels render `$6.9K` instead of mis-rendering the value as `$6.9M`.
   */
  unit?: ChartUnit;
}

// ---------------------------------------------------------------------------
// Fence markers used by `splitMessageWithCharts` + the backend tool output.
// ---------------------------------------------------------------------------

export const CHART_FENCE_OPEN = "```chart";
export const CHART_FENCE_CLOSE = "```";

// ---------------------------------------------------------------------------
// Defensive parser
//
// We never trust the incoming JSON — the LLM occasionally drifts. Validate
// the shape ourselves rather than relying on a runtime validator. Returns
// `null` on any structural mismatch; callers should treat that as "render
// the raw text as a code block" and move on.
// ---------------------------------------------------------------------------

const ALLOWED_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  "line",
  "bar",
  "waterfall",
  "pie",
]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isXValue(v: unknown): v is string | number {
  return typeof v === "string" || isFiniteNumber(v);
}

function parsePoint(raw: unknown): ChartPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!isXValue(obj.x)) return null;
  if (!isFiniteNumber(obj.y)) return null;
  return { x: obj.x, y: obj.y };
}

function parseSeries(raw: unknown): ChartSeries | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string") return null;
  if (!Array.isArray(obj.data)) return null;
  const data: ChartPoint[] = [];
  for (const p of obj.data) {
    const point = parsePoint(p);
    if (!point) return null;
    data.push(point);
  }
  return { name: obj.name, data };
}

function parseAnnotation(raw: unknown): ChartAnnotation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!isXValue(obj.x)) return null;
  if (typeof obj.label !== "string") return null;
  return { x: obj.x, label: obj.label };
}

/**
 * Parse the raw JSON body of a ```chart fenced block into a `ChartSpec`.
 * Returns `null` if the JSON is malformed or the shape doesn't match — the
 * renderer should fall back to showing the raw text in those cases.
 */
export function parseChartSpec(raw: string): ChartSpec | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  // type
  if (typeof obj.type !== "string" || !ALLOWED_TYPES.has(obj.type as ChartType)) {
    return null;
  }
  const type = obj.type as ChartType;

  // title
  if (typeof obj.title !== "string") return null;

  // series
  if (!Array.isArray(obj.series) || obj.series.length === 0) return null;
  const series: ChartSeries[] = [];
  for (const s of obj.series) {
    const parsedSeries = parseSeries(s);
    if (!parsedSeries) return null;
    series.push(parsedSeries);
  }

  // pie + waterfall must have exactly one series
  if ((type === "pie" || type === "waterfall") && series.length !== 1) {
    return null;
  }

  // optional labels
  const xLabel = typeof obj.xLabel === "string" ? obj.xLabel : undefined;
  const yLabel = typeof obj.yLabel === "string" ? obj.yLabel : undefined;

  // optional unit — when the field is present it MUST be one of the
  // allowed values, otherwise the entire spec is rejected. We intentionally
  // do NOT silently fall back to "M" here: a typo'd unit ("MM", "USD") is
  // almost certainly a producer bug worth surfacing rather than masking.
  let unit: ChartUnit | undefined;
  if (obj.unit !== undefined) {
    if (typeof obj.unit !== "string" || !ALLOWED_UNITS.has(obj.unit as ChartUnit)) {
      return null;
    }
    unit = obj.unit as ChartUnit;
  }

  // optional annotations
  let annotations: ChartAnnotation[] | undefined;
  if (Array.isArray(obj.annotations)) {
    const out: ChartAnnotation[] = [];
    for (const a of obj.annotations) {
      const parsedAnn = parseAnnotation(a);
      if (!parsedAnn) return null;
      out.push(parsedAnn);
    }
    annotations = out;
  }

  return {
    type,
    title: obj.title,
    ...(xLabel !== undefined ? { xLabel } : {}),
    ...(yLabel !== undefined ? { yLabel } : {}),
    series,
    ...(annotations !== undefined ? { annotations } : {}),
    ...(unit !== undefined ? { unit } : {}),
  };
}

// ---------------------------------------------------------------------------
// Splitter — walks the message body, extracts ```chart fenced blocks, and
// returns ordered parts. Unparseable chart blocks fall through as `text`
// so the user sees something rather than a silent gap.
// ---------------------------------------------------------------------------

export type MessagePart =
  | { kind: "text"; content: string }
  | { kind: "chart"; spec: ChartSpec; raw: string };

export function splitMessageWithCharts(content: string): MessagePart[] {
  if (!content) return [];

  const parts: MessagePart[] = [];
  let cursor = 0;

  while (cursor < content.length) {
    const openIdx = content.indexOf(CHART_FENCE_OPEN, cursor);
    if (openIdx === -1) {
      // No more chart fences — emit the remainder as text.
      const tail = content.slice(cursor);
      if (tail) parts.push({ kind: "text", content: tail });
      break;
    }

    // Push any text before the fence.
    if (openIdx > cursor) {
      parts.push({ kind: "text", content: content.slice(cursor, openIdx) });
    }

    // The opener may be `\`\`\`chart\n{...}` — find the close fence that
    // follows the opener body. Skip past the opener line first.
    const afterOpener = openIdx + CHART_FENCE_OPEN.length;
    // Tolerate optional whitespace + a newline after `\`\`\`chart`.
    let bodyStart = afterOpener;
    while (bodyStart < content.length && content[bodyStart] !== "\n") {
      bodyStart += 1;
    }
    if (content[bodyStart] === "\n") bodyStart += 1;

    const closeIdx = content.indexOf(CHART_FENCE_CLOSE, bodyStart);
    if (closeIdx === -1) {
      // Unterminated fence — treat the whole remainder as text so we don't
      // swallow it silently.
      parts.push({ kind: "text", content: content.slice(openIdx) });
      break;
    }

    const rawBody = content.slice(bodyStart, closeIdx).trim();
    const spec = parseChartSpec(rawBody);
    if (spec) {
      parts.push({ kind: "chart", spec, raw: rawBody });
    } else {
      // Bad JSON — preserve as text so the human can at least read it.
      const full = content.slice(openIdx, closeIdx + CHART_FENCE_CLOSE.length);
      parts.push({ kind: "text", content: full });
    }

    cursor = closeIdx + CHART_FENCE_CLOSE.length;
    // Skip a single trailing newline so we don't leave an orphan blank line
    // between the chart and the next paragraph.
    if (content[cursor] === "\n") cursor += 1;
  }

  return parts;
}
