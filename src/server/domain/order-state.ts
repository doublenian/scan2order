import { conflict } from './errors.js';

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PAID',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ['UNPAID', 'PAID'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: '待支付',
  PAID: '已支付',
  PREPARING: '制作中',
  READY: '待取餐',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

/** 状态机唯一事实来源：任何入口（顾客支付、后台流转、取消）都必须经过此处。 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw conflict(`订单当前状态「${STATUS_LABELS[from]}」不允许变更为「${STATUS_LABELS[to]}」`);
  }
}

export function assertCancellable(from: OrderStatus): void {
  assertTransition(from, 'CANCELLED');
}

/**
 * 模拟支付只允许从未支付且待支付的订单进入 PAID。
 * 重复支付、已取消或已进入制作的订单一律 409。
 */
export function assertPayable(status: OrderStatus, paymentStatus: PaymentStatus): void {
  if (paymentStatus === 'PAID') {
    throw conflict('订单已支付，请勿重复支付');
  }
  assertTransition(status, 'PAID');
}

export function isTerminal(status: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
