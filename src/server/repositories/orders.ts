import type { Db } from '../db/client.js';
import { nowIso } from '../db/client.js';
import type { OrderStatus, PaymentStatus } from '../domain/order-state.js';
import { parseJsonArray, type PageResult } from './shared.js';
import type { SpecSnapshot } from '../modules/orders/order-types.js';

export interface OrderRow {
  id: number;
  order_no: string;
  table_id: number;
  customer_id: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total_cents: number;
  remark: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: number;
  order_id: number;
  dish_id: number;
  dish_name_snapshot: string;
  unit_price_cents: number;
  quantity: number;
  spec_snapshot_json: string;
  created_at: string;
}

export interface OrderItemDto {
  dishId: number;
  dishNameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  specSnapshot: SpecSnapshot[];
}

export interface OrderDto {
  id: number;
  orderNo: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalCents: number;
  remark: string;
  table: { id: number; tableNo: string };
  items: OrderItemDto[];
  createdAt: string;
  paidAt: string | null;
}

export interface OrderWithTableRow extends OrderRow {
  table_no: string;
}

function toItemDto(row: OrderItemRow): OrderItemDto {
  return {
    dishId: row.dish_id,
    dishNameSnapshot: row.dish_name_snapshot,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
    specSnapshot: parseJsonArray<SpecSnapshot>(row.spec_snapshot_json),
  };
}

function toOrderDto(row: OrderWithTableRow, items: OrderItemDto[]): OrderDto {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    paymentStatus: row.payment_status,
    totalCents: row.total_cents,
    remark: row.remark,
    table: { id: row.table_id, tableNo: row.table_no },
    items,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

export function findOrderRow(db: Db, id: number): OrderRow | undefined {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
}

/** 批量取明细，避免 N+1 查询。 */
export function findItemsByOrderIds(db: Db, orderIds: number[]): Map<number, OrderItemDto[]> {
  const result = new Map<number, OrderItemDto[]>();
  if (orderIds.length === 0) return result;
  const placeholders = orderIds.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id ASC`,
  ).all(...orderIds) as OrderItemRow[];
  for (const row of rows) {
    const list = result.get(row.order_id) ?? [];
    list.push(toItemDto(row));
    result.set(row.order_id, list);
  }
  return result;
}

export function getOrderDetail(db: Db, id: number): OrderDto | undefined {
  const row = db.prepare(
    `SELECT o.*, t.table_no FROM orders o JOIN tables t ON t.id = o.table_id WHERE o.id = ?`,
  ).get(id) as OrderWithTableRow | undefined;
  if (!row) return undefined;
  const items = findItemsByOrderIds(db, [id]).get(id) ?? [];
  return toOrderDto(row, items);
}

export interface AdminOrderFilter {
  status?: OrderStatus;
  tableId?: number;
  dateFrom?: string;
  dateTo?: string;
}

export function listOrdersForAdmin(
  db: Db, filter: AdminOrderFilter, page: number, pageSize: number,
): PageResult<OrderDto> {
  const conditions: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (filter.status) { conditions.push('o.status = ?'); params.push(filter.status); }
  if (filter.tableId !== undefined) { conditions.push('o.table_id = ?'); params.push(filter.tableId); }
  if (filter.dateFrom) { conditions.push('o.created_at >= ?'); params.push(filter.dateFrom); }
  if (filter.dateTo) { conditions.push('o.created_at < ?'); params.push(filter.dateTo); }
  const where = conditions.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) AS total FROM orders o WHERE ${where}`).get(...params) as { total: number }).total;
  const rows = db.prepare(
    `SELECT o.*, t.table_no FROM orders o JOIN tables t ON t.id = o.table_id
     WHERE ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize) as OrderWithTableRow[];
  const itemsByOrder = findItemsByOrderIds(db, rows.map((row) => row.id));
  return {
    total, page, pageSize,
    items: rows.map((row) => toOrderDto(row, itemsByOrder.get(row.id) ?? [])),
  };
}

export function listOrdersForCustomer(db: Db, customerId: number, page: number, pageSize: number): PageResult<OrderDto> {
  const total = (db.prepare('SELECT COUNT(*) AS total FROM orders WHERE customer_id = ?').get(customerId) as { total: number }).total;
  const rows = db.prepare(
    `SELECT o.*, t.table_no FROM orders o JOIN tables t ON t.id = o.table_id
     WHERE o.customer_id = ? ORDER BY o.id DESC LIMIT ? OFFSET ?`,
  ).all(customerId, pageSize, (page - 1) * pageSize) as OrderWithTableRow[];
  const itemsByOrder = findItemsByOrderIds(db, rows.map((row) => row.id));
  return {
    total, page, pageSize,
    items: rows.map((row) => toOrderDto(row, itemsByOrder.get(row.id) ?? [])),
  };
}

export interface NewOrder {
  orderNo: string;
  tableId: number;
  customerId: number;
  totalCents: number;
  remark: string;
  orderNoCreatedAt: string;
}

export function insertOrder(db: Db, input: NewOrder): number {
  const now = input.orderNoCreatedAt;
  const result = db.prepare(
    `INSERT INTO orders (order_no, table_id, customer_id, status, payment_status, total_cents, remark, created_at, updated_at)
     VALUES (?, ?, ?, 'PENDING_PAYMENT', 'UNPAID', ?, ?, ?, ?)`,
  ).run(input.orderNo, input.tableId, input.customerId, input.totalCents, input.remark, now, now);
  return Number(result.lastInsertRowid);
}

export interface NewOrderItem {
  orderId: number;
  dishId: number;
  dishNameSnapshot: string;
  unitPriceCents: number;
  quantity: number;
  specSnapshot: SpecSnapshot[];
}

export function insertOrderItem(db: Db, input: NewOrderItem): void {
  db.prepare(
    `INSERT INTO order_items (order_id, dish_id, dish_name_snapshot, unit_price_cents, quantity, spec_snapshot_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.orderId, input.dishId, input.dishNameSnapshot, input.unitPriceCents,
    input.quantity, JSON.stringify(input.specSnapshot), nowIso());
}

export function updateOrderState(
  db: Db, id: number, status: OrderStatus, paymentStatus: PaymentStatus, paidAt: string | null,
): void {
  db.prepare('UPDATE orders SET status = ?, payment_status = ?, paid_at = ?, updated_at = ? WHERE id = ?')
    .run(status, paymentStatus, paidAt, nowIso(), id);
}

export function insertPayment(db: Db, orderId: number, amountCents: number, paidAt: string): void {
  db.prepare(
    `INSERT INTO payments (order_id, method, amount_cents, status, paid_at, created_at)
     VALUES (?, 'MOCK', ?, 'PAID', ?, ?)`,
  ).run(orderId, amountCents, paidAt, paidAt);
}

export interface OverviewData {
  date: string;
  todayOrderCount: number;
  todayRevenueCents: number;
  statusCounts: Record<OrderStatus, number>;
}

export function getOverview(db: Db, date: string, start: string, end: string): OverviewData {
  const countRow = db.prepare(
    `SELECT COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ? AND status != 'CANCELLED'`,
  ).get(start, end) as { count: number };
  const revenueRow = db.prepare(
    `SELECT COALESCE(SUM(total_cents), 0) AS total FROM orders
     WHERE created_at >= ? AND created_at < ? AND paid_at IS NOT NULL AND status != 'CANCELLED'`,
  ).get(start, end) as { total: number };
  const statusRows = db.prepare(
    `SELECT status, COUNT(*) AS count FROM orders WHERE created_at >= ? AND created_at < ? GROUP BY status`,
  ).all(start, end) as { status: OrderStatus; count: number }[];

  const statusCounts: Record<OrderStatus, number> = {
    PENDING_PAYMENT: 0, PAID: 0, PREPARING: 0, READY: 0, COMPLETED: 0, CANCELLED: 0,
  };
  for (const row of statusRows) statusCounts[row.status] = row.count;

  return {
    date,
    todayOrderCount: countRow.count,
    todayRevenueCents: revenueRow.total,
    statusCounts,
  };
}
