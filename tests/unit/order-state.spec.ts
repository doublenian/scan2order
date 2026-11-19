import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/server/domain/errors.js';
import {
  assertCancellable, assertPayable, assertTransition, canTransition, isTerminal,
  type OrderStatus,
} from '../../src/server/domain/order-state.js';

describe('订单状态机', () => {
  it('允许全部正向流转', () => {
    const pairs: [OrderStatus, OrderStatus][] = [
      ['PENDING_PAYMENT', 'PAID'],
      ['PAID', 'PREPARING'],
      ['PREPARING', 'READY'],
      ['READY', 'COMPLETED'],
      ['PENDING_PAYMENT', 'CANCELLED'],
      ['PAID', 'CANCELLED'],
    ];
    for (const [from, to] of pairs) {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  });

  it('拒绝跳跃、逆向与终态流转', () => {
    const pairs: [OrderStatus, OrderStatus][] = [
      ['PENDING_PAYMENT', 'READY'],
      ['PENDING_PAYMENT', 'COMPLETED'],
      ['PREPARING', 'PENDING_PAYMENT'],
      ['READY', 'PAID'],
      ['COMPLETED', 'CANCELLED'],
      ['CANCELLED', 'PAID'],
    ];
    for (const [from, to] of pairs) {
      expect(canTransition(from, to)).toBe(false);
      try {
        assertTransition(from, to);
        throw new Error('应当抛出 409');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).httpStatus).toBe(409);
      }
    }
  });

  it('PREPARING 起禁止取消', () => {
    expect(() => assertCancellable('PAID')).not.toThrow();
    expect(() => assertCancellable('PREPARING')).toThrow(AppError);
    expect(() => assertCancellable('READY')).toThrow(AppError);
  });

  it('仅待支付未支付订单可模拟支付', () => {
    expect(() => assertPayable('PENDING_PAYMENT', 'UNPAID')).not.toThrow();
    expect(() => assertPayable('PENDING_PAYMENT', 'PAID')).toThrow(AppError);
    expect(() => assertPayable('PREPARING', 'UNPAID')).toThrow(AppError);
    expect(() => assertPayable('CANCELLED', 'UNPAID')).toThrow(AppError);
  });

  it('COMPLETED 与 CANCELLED 为终态', () => {
    expect(isTerminal('COMPLETED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('READY')).toBe(false);
  });
});
