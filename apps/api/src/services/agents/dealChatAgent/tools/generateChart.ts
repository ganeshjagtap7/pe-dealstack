// ─── generate_chart tool ──────────────────────────────────────────
// Returns a fenced ```chart block containing a minified JSON ChartSpec.
// The frontend chat renderer extracts that block and renders Chart.js
// inline inside the message bubble. No rendering happens server-side —
// the tool's job is just to SHAPE the spec, validate it, and emit the
// marker. Persistence is "free" because the marker rides inside the
// chat message body.
//
// The schema below MIRRORS the `ChartSpec` interface in
// `apps/web-next/src/lib/dealchat-skills/chart-spec.ts`. We intentionally
// duplicate the shape rather than cross-importing across apps — sharing
// types over the workspace boundary breaks the tsc build path in both
// directions. If you change one schema, update the other.

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { log } from '../../../../utils/logger.js';

const CHART_FENCE_OPEN = '```chart';
const CHART_FENCE_CLOSE = '```';

const chartPointSchema = z.object({
  x: z.union([z.string(), z.number()]),
  y: z.number().finite(),
});

const chartSeriesSchema = z.object({
  name: z.string().min(1),
  data: z.array(chartPointSchema).min(1),
});

const chartAnnotationSchema = z.object({
  x: z.union([z.string(), z.number()]),
  label: z.string().min(1),
});

const chartUnitSchema = z
  .enum(['K', 'M', 'B', 'units'])
  .describe(
    [
      "Display unit for y-axis ticks. REQUIRED when source data is from get_deal_financials.",
      "Map from the row's unitScale: ACTUALS -> 'units', THOUSANDS -> 'K', MILLIONS -> 'M', BILLIONS -> 'B'.",
      "Mismatch will mis-render the chart axis (e.g., raw-dollar y-values rendered with the default 'M' suffix display as $0.0M for every tick).",
      "Use 'units' for raw counts, percentages, or any dataset whose y-values are already in actual dollars (not scaled).",
    ].join(' '),
  );

const chartSpecSchema = z
  .object({
    type: z.enum(['line', 'bar', 'waterfall', 'pie']),
    title: z.string().min(1),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    series: z.array(chartSeriesSchema).min(1),
    annotations: z.array(chartAnnotationSchema).optional(),
    // Kept optional for backwards-compatibility with older tool callers; the
    // tool description and the agent's system prompt instruct callers to
    // ALWAYS set this when y-values come from financials. The frontend
    // renderer has a defensive fallback (see deal-chat-chart-artifact.tsx)
    // when this is omitted, but the agent prompt is the primary fix.
    unit: chartUnitSchema.optional(),
  })
  .refine(
    (s) => !(s.type === 'pie' || s.type === 'waterfall') || s.series.length === 1,
    { message: 'pie and waterfall charts must have exactly one series' },
  );

type ChartSpecInput = z.infer<typeof chartSpecSchema>;

function buildChartArtifact(spec: ChartSpecInput): string {
  // Strip undefined optionals before serializing so the marker stays compact.
  const compact: Record<string, unknown> = {
    type: spec.type,
    title: spec.title,
    series: spec.series,
  };
  if (spec.xLabel !== undefined) compact.xLabel = spec.xLabel;
  if (spec.yLabel !== undefined) compact.yLabel = spec.yLabel;
  if (spec.annotations !== undefined) compact.annotations = spec.annotations;
  if (spec.unit !== undefined) compact.unit = spec.unit;
  const json = JSON.stringify(compact);
  return `${CHART_FENCE_OPEN}\n${json}\n${CHART_FENCE_CLOSE}`;
}

export function makeGenerateChartTool() {
  return tool(
    async (input) => {
      const parsed = chartSpecSchema.safeParse(input);
      if (!parsed.success) {
        const message = parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        log.warn('[generate_chart] validation failed', { message });
        return `Chart generation failed: ${message}`;
      }

      log.info('[generate_chart] called', {
        type: parsed.data.type,
        seriesCount: parsed.data.series.length,
        pointCount: parsed.data.series.reduce((acc, s) => acc + s.data.length, 0),
      });

      return buildChartArtifact(parsed.data);
    },
    {
      name: 'generate_chart',
      description:
        "Render a chart inline in the chat. Use when a visual would communicate more clearly than numbers in a table (trends, comparisons, distributions). The chart appears in the message text — DO NOT also describe the same data in a long paragraph after the chart. Chart data must come from get_deal_financials (or compare_deals for comp sets) — never fabricate. CRITICAL: set the `unit` field to match the source data's unitScale (ACTUALS -> 'units', THOUSANDS -> 'K', MILLIONS -> 'M', BILLIONS -> 'B'). Omitting `unit` defaults the y-axis to millions and renders raw-dollar values as $0.0M.",
      schema: chartSpecSchema,
    },
  );
}
