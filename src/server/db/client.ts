import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SCHEMA_SQL } from './schema.js';

export type Db = Database.Database;

export function createDb(filePath: string): Db {
  if (filePath !== ':memory:') {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  return db;
}

export function migrate(db: Db): void {
  db.exec(SCHEMA_SQL);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function businessTimezone(): string {
  return process.env.TZ || 'Asia/Shanghai';
}

/** 业务“今日”日期 YYYY-MM-DD（按 TZ 计算）。 */
export function businessDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: businessTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * 业务日对应的 UTC 区间 [start, end)，均以 toISOString() 的 Z 形式表示，
 * 与 nowIso() 存储格式一致，可直接做字符串比较与 SQL 范围查询。
 */
export function businessDayRange(date = businessDate()): { start: string; end: string } {
  const [year, month, day] = date.split('-').map(Number);
  const localMidnightUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - timezoneOffsetMs(date);
  const start = new Date(localMidnightUtc).toISOString();
  const end = new Date(localMidnightUtc + 86_400_000).toISOString();
  return { start, end };
}

/** 通过 Intl 获取指定日期在当地时区的 GMT 偏移毫秒数，不依赖日期库。 */
function timezoneOffsetMs(date: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: businessTimezone(),
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${date}T12:00:00.000Z`));
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
  if (!match) return 0;
  const total = Number(match[2]) * 60 + Number(match[3]);
  return (match[1] === '-' ? -total : total) * 60_000;
}
