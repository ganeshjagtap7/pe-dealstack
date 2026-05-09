// Smart filter presets — ported from vdrMockData.ts and
// FiltersBar.tsx. Same logic so behavior matches.

import type { SmartFilter, VDRFile } from "./types";

export const DEFAULT_SMART_FILTERS: SmartFilter[] = [
  {
    id: "pdfs",
    label: "PDFs Only",
    icon: "picture_as_pdf",
    active: false,
    filterFn: (file) => file.type === "pdf",
  },
  {
    id: "spreadsheets",
    label: "Spreadsheets",
    icon: "table_chart",
    active: false,
    filterFn: (file) => file.type === "excel",
  },
  {
    id: "ai-warnings",
    label: "AI Warnings",
    icon: "warning",
    active: false,
    filterFn: (file) => file.analysis.type === "warning" || file.isHighlighted === true,
  },
  {
    id: "recent",
    label: "Last 30 Days",
    icon: "calendar_month",
    active: false,
    filterFn: (file) => {
      const fileDate = new Date(file.date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      return fileDate >= cutoff;
    },
  },
];

export const CUSTOM_FILTER_PRESETS: Array<{
  id: string;
  label: string;
  icon: string;
  filterFn: (file: VDRFile) => boolean;
}> = [
  {
    id: "docs",
    label: "Word Documents",
    icon: "description",
    filterFn: (file) => file.type === "doc",
  },
  {
    id: "large-files",
    label: "Large Files (>5 MB)",
    icon: "hard_drive",
    filterFn: (file) => {
      const match = file.size.match(/([\d.]+)\s*(KB|MB|GB)/i);
      if (!match) return false;
      const val = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      const mb = unit === "GB" ? val * 1024 : unit === "MB" ? val : val / 1024;
      return mb > 5;
    },
  },
  {
    id: "small-files",
    label: "Small Files (<1 MB)",
    icon: "file_present",
    filterFn: (file) => {
      const match = file.size.match(/([\d.]+)\s*(KB|MB|GB)/i);
      if (!match) return false;
      const val = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      const mb = unit === "GB" ? val * 1024 : unit === "MB" ? val : val / 1024;
      return mb < 1;
    },
  },
  {
    id: "last-7-days",
    label: "Last 7 Days",
    icon: "today",
    filterFn: (file) => {
      const fileDate = new Date(file.date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      return fileDate >= cutoff;
    },
  },
  {
    id: "last-90-days",
    label: "Last 90 Days",
    icon: "date_range",
    filterFn: (file) => {
      const fileDate = new Date(file.date);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      return fileDate >= cutoff;
    },
  },
  {
    id: "ai-analyzed",
    label: "AI Analyzed",
    icon: "auto_awesome",
    filterFn: (file) =>
      file.analysis.type === "key-insight" || file.analysis.type === "complete",
  },
  {
    id: "ready-for-ai",
    label: "Ready for AI",
    icon: "check_circle",
    filterFn: (file) => file.analysis.type === "ready",
  },
  {
    id: "pending-analysis",
    label: "Pending Analysis",
    icon: "hourglass_top",
    // Loosened per 68ff3f8: any standard-type file is pending, label
    // substring check was too narrow.
    filterFn: (file) => file.analysis.type === "standard",
  },
];
