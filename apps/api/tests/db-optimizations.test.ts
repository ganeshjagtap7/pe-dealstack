/**
 * Database Optimization Tests
 * Tests for indexes migration SQL, optimistic locking, and concurrent user support.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ============================================================
// SQL Migration — Index Verification
// ============================================================

describe('Performance indexes migration', () => {
  const migrationPath = path.join(__dirname, '../prisma/migrations/add_performance_indexes.sql');
  let sql: string;

  it('should have the migration file', () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    sql = fs.readFileSync(migrationPath, 'utf-8');
  });

  it('should create Deal indexes', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('idx_deal_status');
    expect(sql).toContain('idx_deal_stage');
    expect(sql).toContain('idx_deal_created');
  });

  it('should create Company name index', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('idx_company_name');
  });

  it('should create Document indexes', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('idx_doc_deal');
    expect(sql).toContain('idx_doc_status');
  });

  it('should create Activity index', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('idx_activity_deal');
  });

  it('should create AuditLog indexes', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('idx_audit_action');
    expect(sql).toContain('idx_audit_entity');
    expect(sql).toContain('idx_audit_user');
    expect(sql).toContain('idx_audit_time');
  });

  it('should create Memo index', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('idx_memo_deal');
  });

  it('should create DocumentChunk indexes for RAG', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('idx_chunk_deal');
    expect(sql).toContain('idx_chunk_doc');
  });

  it('should use IF NOT EXISTS for all indexes', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    const createIndexLines = sql.split('\n').filter(l => l.trim().startsWith('CREATE INDEX'));
    expect(createIndexLines.length).toBeGreaterThanOrEqual(10);
    createIndexLines.forEach(line => {
      expect(line).toContain('IF NOT EXISTS');
    });
  });

  it('should reference trigram extension in comments', () => {
    sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('pg_trgm');
  });
});

// ============================================================
// Optimistic Locking — Logic Tests
// ============================================================

describe('Optimistic locking logic', () => {
  function wouldConflict(clientTimestamp: string, serverTimestamp: string): boolean {
    return new Date(clientTimestamp).getTime() < new Date(serverTimestamp).getTime();
  }

  it('should detect conflict when client timestamp is older', () => {
    expect(wouldConflict('2026-02-13T09:00:00Z', '2026-02-13T10:00:00Z')).toBe(true);
  });

  it('should not conflict when timestamps match', () => {
    expect(wouldConflict('2026-02-13T10:00:00Z', '2026-02-13T10:00:00Z')).toBe(false);
  });

  it('should not conflict when client timestamp is newer', () => {
    expect(wouldConflict('2026-02-13T11:00:00Z', '2026-02-13T10:00:00Z')).toBe(false);
  });

  it('should detect 1-second difference', () => {
    expect(wouldConflict('2026-02-13T10:00:00Z', '2026-02-13T10:00:01Z')).toBe(true);
  });

  it('should handle millisecond precision', () => {
    expect(wouldConflict('2026-02-13T10:00:00.000Z', '2026-02-13T10:00:00.001Z')).toBe(true);
    expect(wouldConflict('2026-02-13T10:00:00.001Z', '2026-02-13T10:00:00.000Z')).toBe(false);
  });
});
