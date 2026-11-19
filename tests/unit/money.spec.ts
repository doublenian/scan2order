import { describe, expect, it } from 'vitest';
import {
  calculateTotalCents, calculateUnitPriceCents, formatCents, parseYuanToCents,
} from '../../src/server/domain/money.js';

describe('整数分计价', () => {
  it('基础价 + 规格固定加价 + 选项加价', () => {
    expect(calculateUnitPriceCents(1500, 200, [{ extraPriceCents: 300 }, { extraPriceCents: 100 }]))
      .toBe(2100);
  });

  it('无规格菜品单价等于基础价', () => {
    expect(calculateUnitPriceCents(800)).toBe(800);
  });

  it('总价为各明细整数分之和，无浮点误差', () => {
    const total = calculateTotalCents([
      { unitPriceCents: 1500, quantity: 2 },
      { unitPriceCents: 800, quantity: 1 },
    ]);
    expect(total).toBe(3800);
  });

  it('0.1 元 × 3 不会累加出浮点误差', () => {
    expect(calculateTotalCents([{ unitPriceCents: 10, quantity: 3 }])).toBe(30);
  });

  it('展示格式化保留两位小数', () => {
    expect(formatCents(3800)).toBe('38.00');
    expect(formatCents(5)).toBe('0.05');
    expect(formatCents(0)).toBe('0.00');
  });

  it('元转分只接受最多两位小数', () => {
    expect(parseYuanToCents('12.34')).toBe(1234);
    expect(parseYuanToCents('8')).toBe(800);
    expect(parseYuanToCents('8.1')).toBe(810);
    expect(parseYuanToCents('8.123')).toBeNull();
    expect(parseYuanToCents('abc')).toBeNull();
  });
});
