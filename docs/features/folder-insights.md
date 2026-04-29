# Folder Insights

AI-generated summary, completion percentage, red flags, and missing-document suggestions for each VDR folder.

## Where

- Service: [`apps/api/src/services/folderInsightsGenerator.ts`](../../apps/api/src/services/folderInsightsGenerator.ts)
- Route: [`apps/api/src/routes/folders-insights.ts`](../../apps/api/src/routes/folders-insights.ts)
- DB table: `FolderInsight`

## Output shape

```ts
{
  summary: string,            // 1-paragraph
  completionPercent: number,  // 0..100
  redFlags: string[],         // e.g. "missing audited financials for FY22"
  missingDocuments: string[]  // e.g. "Cap table", "Customer concentration analysis"
}
```

Generated on demand; cached in `FolderInsight` rows.

## How it's used

Right-rail panel in the VDR. Click a folder → panel renders.

## Tuning

The system prompt in `folderInsightsGenerator.ts` lists expected categories per folder type (e.g. "Financials" expects audited statements, monthly tabs, MIS, KPIs). Add categories as your firm's diligence list evolves.

## Related

- [VDR](./vdr.md)
- [Document Management](./document-management.md)
