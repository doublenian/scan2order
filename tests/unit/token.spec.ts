import { describe, expect, it } from 'vitest';
import {
  generateOrderNo, generateQrToken, generateVisitorToken, hashVisitorToken,
} from '../../src/server/domain/token.js';

describe('令牌与哈希', () => {
  it('相同令牌哈希稳定且为 64 位十六进制', () => {
    const hash = hashVisitorToken('visitor-token-abc');
    expect(hash).toBe(hashVisitorToken('visitor-token-abc'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('visitor-token-abc');
  });

  it('不同令牌哈希不同', () => {
    expect(hashVisitorToken('a')).not.toBe(hashVisitorToken('b'));
  });

  it('生成的令牌具备随机性', () => {
    expect(generateVisitorToken()).not.toBe(generateVisitorToken());
    expect(generateQrToken()).not.toBe(generateQrToken());
    expect(generateQrToken()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('订单号包含业务日期且长度稳定', () => {
    const no = generateOrderNo('20261119');
    expect(no).toMatch(/^S2O20261119[0-9A-F]{12}$/);
  });
});
