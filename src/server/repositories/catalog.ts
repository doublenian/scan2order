import type { Db } from '../db/client.js';
import { nowIso } from '../db/client.js';
import { parseJsonArray, type PageResult } from './shared.js';

export interface CategoryRow {
  id: number;
  name: string;
  sort_order: number;
  status: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DishRow {
  id: number;
  category_id: number;
  name: string;
  description: string;
  image_url: string;
  price_cents: number;
  tags_json: string;
  status: string;
  sort_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpecRow {
  id: number;
  dish_id: number;
  name: string;
  options_json: string;
  extra_price_cents: number;
  required: number;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DishOption {
  id: string;
  label: string;
  extraPriceCents: number;
}

export interface CategoryDto {
  id: number;
  name: string;
  sortOrder: number;
  status: string;
  dishCount: number;
  createdAt: string;
}

export interface SpecDto {
  id: number;
  name: string;
  required: boolean;
  extraPriceCents: number;
  options: DishOption[];
}

export interface DishDto {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  tags: string[];
  status: string;
  sortOrder: number;
  specs: SpecDto[];
  createdAt: string;
}

export function toSpecDto(row: SpecRow): SpecDto {
  return {
    id: row.id,
    name: row.name,
    required: row.required === 1,
    extraPriceCents: row.extra_price_cents,
    options: parseJsonArray<DishOption>(row.options_json),
  };
}

export function toDishDto(row: DishRow, specs: SpecDto[] = []): DishDto {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    imageUrl: row.image_url,
    tags: parseJsonArray<string>(row.tags_json),
    status: row.status,
    sortOrder: row.sort_order,
    specs,
    createdAt: row.created_at,
  };
}

export function listActiveCategoriesWithCounts(db: Db): CategoryDto[] {
  const rows = db.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM dishes d
        WHERE d.category_id = c.id AND d.deleted_at IS NULL AND d.status = 'on') AS dish_count
     FROM categories c
     WHERE c.deleted_at IS NULL AND c.status = 'active'
     ORDER BY c.sort_order ASC, c.id ASC`,
  ).all() as (CategoryRow & { dish_count: number })[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    status: row.status,
    dishCount: row.dish_count,
    createdAt: row.created_at,
  }));
}

export function listCategories(db: Db, page: number, pageSize: number): PageResult<CategoryDto> {
  const total = (db.prepare('SELECT COUNT(*) AS total FROM categories WHERE deleted_at IS NULL').get() as { total: number }).total;
  const rows = db.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM dishes d
        WHERE d.category_id = c.id AND d.deleted_at IS NULL) AS dish_count
     FROM categories c WHERE c.deleted_at IS NULL
     ORDER BY c.sort_order ASC, c.id ASC LIMIT ? OFFSET ?`,
  ).all(pageSize, (page - 1) * pageSize) as (CategoryRow & { dish_count: number })[];
  return {
    total,
    page,
    pageSize,
    items: rows.map((row) => ({
      id: row.id, name: row.name, sortOrder: row.sort_order, status: row.status,
      dishCount: row.dish_count, createdAt: row.created_at,
    })),
  };
}

export function findCategoryById(db: Db, id: number): CategoryRow | undefined {
  return db.prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL').get(id) as CategoryRow | undefined;
}

export function createCategory(db: Db, name: string, sortOrder: number, status: string): CategoryRow {
  const now = nowIso();
  const result = db.prepare(
    `INSERT INTO categories (name, sort_order, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(name, sortOrder, status, now, now);
  return findCategoryById(db, Number(result.lastInsertRowid))!;
}

export function updateCategory(db: Db, id: number, name: string, sortOrder: number, status: string): void {
  db.prepare('UPDATE categories SET name = ?, sort_order = ?, status = ?, updated_at = ? WHERE id = ?')
    .run(name, sortOrder, status, nowIso(), id);
}

export function softDeleteCategory(db: Db, id: number): void {
  db.prepare('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(nowIso(), nowIso(), id);
}

export interface DishListFilter {
  categoryId?: number;
  keyword?: string;
}

export function listDishes(db: Db, filter: DishListFilter, page: number, pageSize: number): PageResult<DishDto> {
  const conditions = ['deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filter.categoryId !== undefined) {
    conditions.push('category_id = ?');
    params.push(filter.categoryId);
  }
  if (filter.keyword) {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    params.push(`%${filter.keyword}%`, `%${filter.keyword}%`);
  }
  const where = conditions.join(' AND ');
  const total = (db.prepare(`SELECT COUNT(*) AS total FROM dishes WHERE ${where}`).get(...params) as { total: number }).total;
  const rows = db.prepare(
    `SELECT * FROM dishes WHERE ${where} ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize) as DishRow[];
  const specs = listSpecsByDishIds(db, rows.map((row) => row.id));
  const byDish = new Map<number, SpecDto[]>();
  for (const spec of specs) {
    const list = byDish.get(spec.dish_id) ?? [];
    list.push(toSpecDto(spec));
    byDish.set(spec.dish_id, list);
  }
  return { total, page, pageSize, items: rows.map((row) => toDishDto(row, byDish.get(row.id) ?? [])) };
}

export function findDishById(db: Db, id: number, includeDeleted = false): DishRow | undefined {
  const sql = includeDeleted
    ? 'SELECT * FROM dishes WHERE id = ?'
    : 'SELECT * FROM dishes WHERE id = ? AND deleted_at IS NULL';
  return db.prepare(sql).get(id) as DishRow | undefined;
}

export function findDishesByIds(db: Db, ids: number[]): DishRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM dishes WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
  ).all(...ids) as DishRow[];
}

export function listSpecsByDishIds(db: Db, dishIds: number[]): SpecRow[] {
  if (dishIds.length === 0) return [];
  const placeholders = dishIds.map(() => '?').join(',');
  return db.prepare(
    `SELECT * FROM dish_specs WHERE dish_id IN (${placeholders}) AND status = 'active' ORDER BY sort_order ASC, id ASC`,
  ).all(...dishIds) as SpecRow[];
}

export function findSpecById(db: Db, id: number): SpecRow | undefined {
  return db.prepare('SELECT * FROM dish_specs WHERE id = ? AND status = ?').get(id, 'active') as SpecRow | undefined;
}

export interface SpecInput {
  name: string;
  options: DishOption[];
  extraPriceCents: number;
  required: boolean;
  sortOrder: number;
}

export function replaceSpecs(db: Db, dishId: number, specs: SpecInput[]): void {
  const now = nowIso();
  db.prepare('DELETE FROM dish_specs WHERE dish_id = ?').run(dishId);
  const insert = db.prepare(
    `INSERT INTO dish_specs (dish_id, name, options_json, extra_price_cents, required, sort_order, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  );
  for (const spec of specs) {
    insert.run(dishId, spec.name, JSON.stringify(spec.options), spec.extraPriceCents,
      spec.required ? 1 : 0, spec.sortOrder, now, now);
  }
}

export interface DishInput {
  categoryId: number;
  name: string;
  description: string;
  imageUrl: string;
  priceCents: number;
  tags: string[];
  status: 'on' | 'soldout';
  sortOrder: number;
  specs: SpecInput[];
}

export function createDish(db: Db, input: DishInput): number {
  const now = nowIso();
  const result = db.prepare(
    `INSERT INTO dishes (category_id, name, description, image_url, price_cents, tags_json, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.categoryId, input.name, input.description, input.imageUrl, input.priceCents,
    JSON.stringify(input.tags), input.status, input.sortOrder, now, now);
  const id = Number(result.lastInsertRowid);
  replaceSpecs(db, id, input.specs);
  return id;
}

export function updateDish(db: Db, id: number, input: DishInput): void {
  db.prepare(
    `UPDATE dishes SET category_id = ?, name = ?, description = ?, image_url = ?, price_cents = ?,
     tags_json = ?, status = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
  ).run(input.categoryId, input.name, input.description, input.imageUrl, input.priceCents,
    JSON.stringify(input.tags), input.status, input.sortOrder, nowIso(), id);
  replaceSpecs(db, id, input.specs);
}

export function setDishStatus(db: Db, id: number, status: 'on' | 'soldout'): void {
  db.prepare('UPDATE dishes SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
}

export function softDeleteDish(db: Db, id: number): void {
  db.prepare('UPDATE dishes SET deleted_at = ?, updated_at = ? WHERE id = ?')
    .run(nowIso(), nowIso(), id);
}

export function listAllDishesForAdmin(db: Db, page: number, pageSize: number): PageResult<DishDto> {
  const total = (db.prepare('SELECT COUNT(*) AS total FROM dishes WHERE deleted_at IS NULL').get() as { total: number }).total;
  const rows = db.prepare(
    'SELECT * FROM dishes WHERE deleted_at IS NULL ORDER BY sort_order ASC, id ASC LIMIT ? OFFSET ?',
  ).all(pageSize, (page - 1) * pageSize) as DishRow[];
  const specs = listSpecsByDishIds(db, rows.map((row) => row.id));
  const byDish = new Map<number, SpecDto[]>();
  for (const spec of specs) {
    const list = byDish.get(spec.dish_id) ?? [];
    list.push(toSpecDto(spec));
    byDish.set(spec.dish_id, list);
  }
  return { total, page, pageSize, items: rows.map((row) => toDishDto(row, byDish.get(row.id) ?? [])) };
}
