import type { Db } from '../db/client.js';
import { nowIso } from '../db/client.js';
import { generateQrToken } from '../domain/token.js';
import type { PageResult } from './shared.js';

export interface TableRow {
  id: number;
  table_no: string;
  qr_token: string;
  status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TableDto {
  id: number;
  tableNo: string;
  qrToken: string;
  status: string;
  qrUrl: string;
  createdAt: string;
}

function toDto(row: TableRow, h5BaseUrl: string): TableDto {
  return {
    id: row.id,
    tableNo: row.table_no,
    qrToken: row.qr_token,
    status: row.status,
    qrUrl: `${h5BaseUrl.replace(/\/$/, '')}/?tableToken=${row.qr_token}`,
    createdAt: row.created_at,
  };
}

export function findActiveTableByToken(db: Db, token: string): TableRow | undefined {
  return db.prepare(
    `SELECT * FROM tables WHERE qr_token = ? AND status = 'active' AND deleted_at IS NULL`,
  ).get(token) as TableRow | undefined;
}

export function findTableById(db: Db, id: number, includeDeleted = true): TableRow | undefined {
  const sql = includeDeleted
    ? 'SELECT * FROM tables WHERE id = ?'
    : 'SELECT * FROM tables WHERE id = ? AND deleted_at IS NULL';
  return db.prepare(sql).get(id) as TableRow | undefined;
}

export function listTables(db: Db, h5BaseUrl: string, page: number, pageSize: number): PageResult<TableDto> {
  const total = (db.prepare('SELECT COUNT(*) AS total FROM tables WHERE deleted_at IS NULL').get() as { total: number }).total;
  const rows = db.prepare(
    `SELECT * FROM tables WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ? OFFSET ?`,
  ).all(pageSize, (page - 1) * pageSize) as TableRow[];
  return { total, items: rows.map((row) => toDto(row, h5BaseUrl)), page, pageSize };
}

export function createTable(db: Db, tableNo: string): TableRow {
  const now = nowIso();
  const token = generateQrToken();
  const result = db.prepare(
    `INSERT INTO tables (table_no, qr_token, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`,
  ).run(tableNo, token, now, now);
  return findTableById(db, Number(result.lastInsertRowid))!;
}

export function updateTable(db: Db, id: number, tableNo: string, status: 'active' | 'disabled'): void {
  db.prepare('UPDATE tables SET table_no = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(tableNo, status, nowIso(), id);
}

export function softDeleteTable(db: Db, id: number): void {
  const now = nowIso();
  db.prepare(`UPDATE tables SET deleted_at = ?, status = 'disabled', updated_at = ? WHERE id = ?`)
    .run(now, now, id);
}

export function regenerateQrToken(db: Db, id: number): TableRow {
  const token = generateQrToken();
  db.prepare('UPDATE tables SET qr_token = ?, updated_at = ? WHERE id = ?').run(token, nowIso(), id);
  return findTableById(db, id)!;
}

export function toTableDto(row: TableRow, h5BaseUrl: string): TableDto {
  return toDto(row, h5BaseUrl);
}
