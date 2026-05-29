"use client";

import { ChartRenderer } from "./ChartRenderer";
import { CHART_TYPES, METRIC_CATALOG } from "./constants";
import type { FinancialRow, Graph } from "./types";

interface CreateTileProps {
  onClick: () => void;
}

function CreateTile({ onClick }: CreateTileProps) {
  return (
    <button
      onClick={onClick}
      className="group relative aspect-[4/3] rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/40 hover:border-[#003366] hover:bg-[#E6EEF5]/60 transition flex items-center justify-center"
    >
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-6 rounded-lg border-2 border-dashed border-slate-300 group-hover:border-[#003366] transition">
        <div className="w-11 h-11 rounded-full bg-white border border-slate-200 group-hover:border-[#003366] flex items-center justify-center text-slate-500 group-hover:text-[#003366] shadow-sm">
          <span className="material-symbols-outlined text-[24px]">add</span>
        </div>
        <div className="text-sm font-medium text-slate-700 group-hover:text-[#003366]">
          Create Graph
        </div>
        <div className="text-[11px] text-slate-400 -mt-1.5">
          Build a custom chart from P&amp;L and analysis metrics
        </div>
      </div>
    </button>
  );
}

interface GraphCardProps {
  graph: Graph;
  data: FinancialRow[];
  onEdit: (graph: Graph) => void;
  onDelete: (graph: Graph) => void;
}

function GraphCard({ graph, data, onEdit, onDelete }: GraphCardProps) {
  const seriesLabels = graph.series
    .map((s) => METRIC_CATALOG.find((m) => m.key === s.metricKey)?.label)
    .filter(Boolean);

  return (
    <div className="group relative aspect-[4/3] rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-slate-900 truncate">
              {graph.title}
            </div>
            <div className="text-[11px] text-slate-500 truncate">
              {CHART_TYPES.find((c) => c.key === graph.chartType)?.label} ·{" "}
              {seriesLabels.length} series
            </div>
          </div>
          <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
            {graph.chartType}
          </span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[52px]">
        <ChartRenderer graph={graph} data={data} compact />
      </div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition flex gap-1">
        <button
          onClick={() => onEdit(graph)}
          className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-[#003366] hover:border-[#003366] shadow-sm flex items-center justify-center"
          title="Edit"
        >
          <span className="material-symbols-outlined text-[14px]">edit</span>
        </button>
        <button
          onClick={() => onDelete(graph)}
          className="w-7 h-7 rounded-md bg-white border border-slate-200 text-slate-600 hover:text-rose-700 hover:border-rose-300 shadow-sm flex items-center justify-center"
          title="Delete"
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
        </button>
      </div>
    </div>
  );
}

interface GalleryProps {
  graphs: Graph[];
  data: FinancialRow[];
  onCreate: () => void;
  onEdit: (graph: Graph) => void;
  onDelete: (graph: Graph) => void;
}

export function Gallery({ graphs, data, onCreate, onEdit, onDelete }: GalleryProps) {
  return (
    <div className="max-w-[1280px] mx-auto px-8 py-7">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Graphs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Build custom views off P&amp;L and analysis metrics. Combine absolute
            values and ratios on dual axes.
          </p>
        </div>
        <div className="text-xs text-slate-400">{graphs.length} saved</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <CreateTile onClick={onCreate} />
        {graphs.map((g) => (
          <GraphCard
            key={g.id}
            graph={g}
            data={data}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}
