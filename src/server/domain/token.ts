import { createHash, randomBytes } from 'node:crypto';

/** 顾客令牌只存哈希；桌台令牌为随机串，均不写入任何可读凭据。 */
export function hashVisitorToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateVisitorToken(): string {
  return `vst_${randomBytes(24).toString('base64url')}`;
}

export function generateQrToken(): string {
  return randomBytes(16).toString('hex');
}

export function generateOrderNo(dateCompact: string): string {
  return `S2O${dateCompact}${randomBytes(6).toString('hex').toUpperCase()}`;
}
