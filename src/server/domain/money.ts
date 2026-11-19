/**
 * 金额一律使用整数分运算，禁止浮点累加。
 * 单项最终单价 = 菜品基础价 + 规格固定加价 + 各选项加价之和。
 */
export interface OptionPrice {
  extraPriceCents: number;
}

export function calculateUnitPriceCents(
  basePriceCents: number,
  specExtraCents = 0,
  optionExtras: OptionPrice[] = [],
): number {
  const optionTotal = optionExtras.reduce((sum, option) => sum + option.extraPriceCents, 0);
  return basePriceCents + specExtraCents + optionTotal;
}

export interface PricedItem {
  unitPriceCents: number;
  quantity: number;
}

export function calculateTotalCents(items: PricedItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

/** 展示格式化：12345 分 -> "123.45"。仅用于展示，不参与计算。 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 将元字符串转换为整数分（用于管理端录入价格），非法输入返回 null。 */
export function parseYuanToCents(input: string | number): number | null {
  const text = String(input).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [yuan, fraction = ''] = text.split('.');
  return Number(yuan) * 100 + Number(fraction.padEnd(2, '0'));
}
