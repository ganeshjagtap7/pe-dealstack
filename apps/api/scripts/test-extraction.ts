/**
 * Smoke test for the financial extraction pipeline.
 * Run: npx tsx scripts/test-extraction.ts
 */
import 'dotenv/config';
import { createRequire } from 'module';
import { classifyFinancials } from '../src/services/financialClassifier.js';
import { runDeepPass } from '../src/services/financialExtractionOrchestrator.js';
import { validateStatements } from '../src/services/financialValidator.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ── Test document: 360 Advanced Lead Memo (has financials) ────
const TEST_DOC = {
  dealId: 'b2bdeb6a-6cba-410e-accc-55b37540709d',
  documentId: 'fdcf4267-8fd7-4ddc-b76b-f36376b48c9d',
  fileUrl:
    'https://rnipkfubpvyvskswsekk.supabase.co/storage/v1/object/public/documents/b2bdeb6a-6cba-410e-accc-55b37540709d/1771483084818_360_Advanced__Inc._-_Lead_Memo_-_March_2023.pdf',
  name: '360 Advanced, Inc. - Lead Memo - March 2023.pdf',
};

async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Financial Extraction Pipeline Smoke Test');
  console.log('═══════════════════════════════════════════\n');
  console.log(`Document: ${TEST_DOC.name}`);
  console.log(`Deal ID:  ${TEST_DOC.dealId}\n`);

  // ─── Step 1: Download + parse PDF ─────────────────────────
  console.log('Step 1 — Downloading and parsing PDF...');
  const res = await fetch(TEST_DOC.fileUrl);
  if (!res.ok) {
    console.error(`  ✗ Failed to download: HTTP ${res.status}`);
    process.exit(1);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const parsed = await pdfParse(buffer);
  const text = parsed.text ?? '';
  console.log(`  ✓ Extracted ${text.length} chars of text`);
  if (text.trim().length < 100) {
    console.error('  ✗ Text too short — PDF may be image-only or protected');
    process.exit(1);
  }

  // Print first 500 chars so we can see what the doc contains
  console.log('\n--- Document snippet ---');
  console.log(text.slice(0, 600).replace(/\n+/g, '\n').trim());
  console.log('--- end snippet ---\n');

  // ─── Step 2: classifyFinancials ────────────────────────────
  console.log('Step 2 — Running GPT-4o financial classifier (deep pass)...');
  const classification = await classifyFinancials(text);

  if (!classification) {
    console.error('  ✗ Classification returned null — OpenAI may not be configured');
    process.exit(1);
  }

  console.log(`  ✓ Classification complete`);
  console.log(`    Overall confidence: ${classification.overallConfidence}%`);
  console.log(`    Statements found:   ${classification.statements.length}`);
  if (classification.warnings.length > 0) {
    console.log(`    Warnings: ${classification.warnings.join(', ')}`);
  }

  for (const stmt of classification.statements) {
    console.log(`\n  ${stmt.statementType} (${stmt.currency}, ${stmt.unitScale})`);
    for (const p of stmt.periods) {
      const items = Object.entries(p.lineItems)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(`    [${p.periodType}] ${p.period} (conf: ${p.confidence}%): ${items}`);
    }
  }

  // ─── Step 3: Validate ─────────────────────────────────────
  console.log('\nStep 3 — Running validation checks...');
  const validation = validateStatements(classification.statements);
  console.log(`  Errors:   ${validation.errorCount}`);
  console.log(`  Warnings: ${validation.warningCount}`);
  console.log(`  Overall:  ${validation.overallPassed ? 'PASSED' : 'FAILED'}`);
  const failed = validation.checks.filter(c => !c.passed);
  for (const check of failed) {
    console.log(`    [${check.severity.toUpperCase()}] ${check.message}`);
  }

  // ─── Step 4: Deep pass (upsert to DB) ─────────────────────
  console.log('\nStep 4 — Running deep pass (upsert to Supabase)...');
  const result = await runDeepPass({
    text,
    dealId: TEST_DOC.dealId,
    documentId: TEST_DOC.documentId,
  });

  if (!result) {
    console.error('  ✗ Deep pass returned null');
    process.exit(1);
  }

  console.log(`  ✓ Deep pass complete`);
  console.log(`    Statements stored: ${result.statementsStored}`);
  console.log(`    Periods stored:    ${result.periodsStored}`);
  console.log(`    Confidence:        ${result.overallConfidence}%`);
  console.log(`    Statement IDs:     ${result.statementIds.join(', ')}`);
  if (result.warnings.length > 0) {
    console.log(`    Warnings: ${result.warnings.join(', ')}`);
  }

  console.log('\n✓ All steps complete. Check Supabase FinancialStatement table for stored rows.\n');
}

main().catch(err => {
  console.error('\n✗ Test failed:', err);
  process.exit(1);
});
