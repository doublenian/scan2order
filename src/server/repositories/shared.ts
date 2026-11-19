export interface PageResult<T> {
  total: number;
  items: T[];
  page: number;
  pageSize: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export function parseJsonArray<T>(text: string | null | undefined): T[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function paginateQuery<T>(
  countSql: string,
  listSql: string,
  params: unknown[],
  pagination: Pagination,
  mapper: (row: Record<string, unknown>) => T,
  db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[] } },
): PageResult<T> {
  const { page, pageSize } = pagination;
  const total = (db.prepare(countSql).get(...params) as { total: number }).total;
  const rows = db.prepare(listSql).all(...params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
  return { total, items: rows.map(mapper), page, pageSize };
}
