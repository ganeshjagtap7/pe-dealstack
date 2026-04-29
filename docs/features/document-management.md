# Document Management

Anything to do with files attached to a deal — uploads, ingest, parse, chunking, search.

## Sources

| Source | Endpoint | Where it auto-creates Deal? |
| --- | --- | --- |
| File upload | `POST /api/ingest/upload` | yes |
| URL | `POST /api/ingest/url` | yes |
| Email forward | `POST /api/ingest/email` | yes |
| Pasted text | `POST /api/ingest/text` | yes |
| VDR upload | `POST /api/deals/:id/documents/upload` | no (existing deal) |

Routes for ingest: `ingest.ts`, `ingest-upload.ts`, `ingest-url.ts`, `ingest-email.ts`, `ingest-text.ts`, `ingest-shared.ts`.

## Validation

[`fileValidator.ts`](../../apps/api/src/services/fileValidator.ts) does a magic-bytes check, rejecting spoofed MIME. Body limit `50mb` (Express).

## Storage

Supabase Storage `files` bucket. The `Document` row stores `fileUrl` + metadata.

## Parsing

| Parser | Purpose |
| --- | --- |
| [`pdfExtractor.ts`](../../apps/api/src/services/pdfExtractor.ts) | pdf-parse → raw text |
| [`excelParser.ts`](../../apps/api/src/services/excelParser.ts) | xlsx → sheets |
| [`documentParser.ts`](../../apps/api/src/services/documentParser.ts) | mammoth → Word text |
| [`emailParser.ts`](../../apps/api/src/services/emailParser.ts) | mailparser → headers + body |
| [`webScraper.ts`](../../apps/api/src/services/webScraper.ts) | URL fetch + parse |

## Chunking

[`documentChunker.ts`](../../apps/api/src/services/documentChunker.ts) chunks `extractedText` with overlap and writes to `DocumentChunk` (jsonb embeddings). Powers `search_documents` tool in Deal Chat.

## Auto-folder assignment

`documents-upload.ts` auto-assigns `folderId` if missing — otherwise documents vanish from VDR list.

## Doc types

`type` enum: `CIM`, `TEASER`, `FINANCIAL`, `LEGAL`, `TAX`, `OTHER`. Inferred from filename + first-page heuristics; user can override.

## AI alerts

`documents-alerts.ts` produces document-level alerts (suspicious content, missing pages, etc.).

## Related

- [`docs/diagrams/17-document-ingest-pipeline.mmd`](../diagrams/17-document-ingest-pipeline.mmd)
- [`docs/user-flows/deal-ingest.md`](../user-flows/deal-ingest.md)
- [VDR](./vdr.md)
- [Folder Insights](./folder-insights.md)
