import { formatCurrency } from "@/lib/formatters";
import { STAGE_LABELS } from "@/lib/constants";
import type { Deal } from "@/types";

// ---------------------------------------------------------------------------
// CSV Export — generates a CSV blob from selected deals and triggers a
// browser download. Extracted from deals/page.tsx for file-size budget.
// ---------------------------------------------------------------------------

export function exportDealsToCSV(deals: Deal[], selectedIds: Set<string>) {
  const dealsToExport = deals.filter((d) => selectedIds.has(d.id));
  if (dealsToExport.length === 0) return;

  const escapeCSV = (val: string | null | undefined) => {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    "Name", "Industry", "Stage", "Status",
    "Revenue (displayed)", "EBITDA (displayed)", "Deal Size (displayed)",
    "IRR Projected (%)", "MoM Multiple", "AI Thesis",
    "Created At", "Updated At",
  ];

  const rows = dealsToExport.map((deal) => [
    escapeCSV(deal.name),
    escapeCSV(deal.industry),
    escapeCSV(STAGE_LABELS[deal.stage] || deal.stage),
    escapeCSV(deal.status),
    deal.revenue != null ? formatCurrency(deal.revenue) : "",
    deal.ebitda != null ? formatCurrency(deal.ebitda) : "",
    deal.dealSize != null ? formatCurrency(deal.dealSize) : "",
    deal.irrProjected?.toString() ?? "",
    deal.mom?.toString() ?? "",
    escapeCSV(deal.aiThesis),
    deal.createdAt ? new Date(deal.createdAt).toISOString() : "",
    deal.updatedAt ? new Date(deal.updatedAt).toISOString() : "",
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `deals-export-${new Date().toISOString().split("T")[0]}.csv`;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
