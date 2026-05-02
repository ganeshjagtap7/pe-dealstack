"use client";

// Re-export hub for the deals/page.tsx component imports.
// The actual implementations live in co-located files (split per the
// 500-line file-size budget). Re-exporting here keeps every existing
// `import { ... } from "./components"` working without changes.
export { FilterDropdown } from "./deals-filter-dropdown";
export { DeleteModal, StageChangeModal } from "./deals-modals";
export { DealCard } from "./deals-deal-card";
export { KanbanCard } from "./deals-kanban-card";
export { MetricsDropdown } from "./deals-metrics-dropdown";
export { UploadCard } from "./deals-upload-card";
