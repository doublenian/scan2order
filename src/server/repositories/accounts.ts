import type { Db } from '../db/client.js';
import { nowIso } from '../db/client.js';
import type { PageResult } from './shared.js';

export interface AdminUserRow {
  id: number;
  username: string;
  password_hash: string;
  real_name: string;
  role: 'admin' | 'staff';
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountDto {
  id: number;
  username: string;
  realName: string;
  role: 'admin' | 'staff';
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export function toAccountDto(row: AdminUserRow): AccountDto {
  return {
    id: row.id,
    username: row.username,
    realName: row.real_name,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export function findAdminByUsername(db: Db, username: string): AdminUserRow | undefined {
  return db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as AdminUserRow | undefined;
}

export function findAdminById(db: Db, id: number): AdminUserRow | undefined {
  return db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as AdminUserRow | undefined;
}

export function listAccounts(db: Db, page: number, pageSize: number): PageResult<AccountDto> {
  const total = (db.prepare('SELECT COUNT(*) AS total FROM admin_users').get() as { total: number }).total;
  const rows = db.prepare(
    'SELECT * FROM admin_users ORDER BY id ASC LIMIT ? OFFSET ?',
  ).all(pageSize, (page - 1) * pageSize) as AdminUserRow[];
  return { total, page, pageSize, items: rows.map(toAccountDto) };
}

export function createAccount(
  db: Db, username: string, passwordHash: string, realName: string, role: 'admin' | 'staff',
): number {
  const now = nowIso();
  const result = db.prepare(
    `INSERT INTO admin_users (username, password_hash, real_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run(username, passwordHash, realName, role, now, now);
  return Number(result.lastInsertRowid);
}

export function updateAccount(
  db: Db, id: number, realName: string, role: 'admin' | 'staff', status: 'active' | 'disabled', passwordHash?: string,
): void {
  if (passwordHash) {
    db.prepare(
      `UPDATE admin_users SET real_name = ?, role = ?, status = ?, password_hash = ?, updated_at = ? WHERE id = ?`,
    ).run(realName, role, status, passwordHash, nowIso(), id);
  } else {
    db.prepare(
      `UPDATE admin_users SET real_name = ?, role = ?, status = ?, updated_at = ? WHERE id = ?`,
    ).run(realName, role, status, nowIso(), id);
  }
}

export function disableAccount(db: Db, id: number): void {
  db.prepare(`UPDATE admin_users SET status = 'disabled', updated_at = ? WHERE id = ?`).run(nowIso(), id);
}

export function touchLastLogin(db: Db, id: number): void {
  db.prepare('UPDATE admin_users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .run(nowIso(), nowIso(), id);
}
