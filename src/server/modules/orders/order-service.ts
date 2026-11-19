import type { Db } from '../../db/client.js';
import { nowIso } from '../../db/client.js';
import {
  assertCancellable, assertPayable, assertTransition, type OrderStatus,
} from '../../domain/order-state.js';
import {
  insertPayment, updateOrderState, type OrderRow,
} from '../../repositories/orders.js';

/** 模拟支付：写支付记录并推进订单，数据库 unique 约束兜底重复支付。 */
export function payOrder(db: Db, order: OrderRow): void {
  assertPayable(order.status, order.payment_status);
  const paidAt = nowIso();
  db.transaction(() => {
    insertPayment(db, order.id, order.total_cents, paidAt);
    updateOrderState(db, order.id, 'PAID', 'PAID', paidAt);
  })();
}

/** 后台状态流转；PAID 复用支付流程以保证支付记录一致。 */
export function transitionOrder(db: Db, order: OrderRow, target: OrderStatus): void {
  assertTransition(order.status, target);
  if (target === 'PAID') {
    payOrder(db, order);
    return;
  }
  updateOrderState(db, order.id, target, order.payment_status, order.paid_at);
}

export function cancelOrder(db: Db, order: OrderRow): void {
  assertCancellable(order.status);
  updateOrderState(db, order.id, 'CANCELLED', order.payment_status, order.paid_at);
}
