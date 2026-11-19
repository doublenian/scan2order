import type { Db } from '../db/client.js';
import { nowIso } from '../db/client.js';
import type { PageResult } from './shared.js';

export interface CustomerRow {
  id: number;
  visitor_token_hash: string;
  phone: string | null;
  openid: string | null;
  nickname: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CustomerDto {
  id: number;
  phone: string | null;
  openid: string | null;
  nickname: string | null;
  status: string;
  createdAt: string;
}

const toDto = (row: CustomerRow): CustomerDto => ({
  id: row.id,
  phone: row.phone,
  openid: row.openid,
  nickname: row.nickname,
  status: row.status,
  createdAt: row.created_at,
});

export function findCustomerByHash(db: Db, hash: string): CustomerRow | undefined {
  return db.prepare('SELECT * FROM customers WHERE visitor_token_hash = ?').get(hash) as CustomerRow | undefined;
}

export function createCustomer(db: Db, hash: string): number {
  const now = nowIso();
  const result = db.prepare(
    `INSERT INTO customers (visitor_token_hash, status, created_at, updated_at)
     VALUES (?, 'active', ?, ?)`,
  ).run(hash, now, now);
  return Number(result.lastInsertRowid);
}

export function listCustomers(db: Db, page: number, pageSize: number): PageResult<CustomerDto> {
  const total = (db.prepare('SELECT COUNT(*) AS total FROM customers').get() as { total: number }).total;
  const rows = db.prepare(
    `SELECT * FROM customers ORDER BY id DESC LIMIT ? OFFSET ?`,
  ).all(pageSize, (page - 1) * pageSize) as CustomerRow[];
  return { total, items: rows.map(toDto), page, pageSize };
}
