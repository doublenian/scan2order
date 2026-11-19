import { z } from 'zod';

export interface SpecSnapshot {
  specId: number;
  specName: string;
  optionId: string;
  optionLabel: string;
  extraPriceCents: number;
}

export const specSelectionSchema = z.object({
  specId: z.number().int().positive(),
  optionId: z.string().min(1).max(64),
});

export const orderItemSchema = z.object({
  dishId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99),
  specSelections: z.array(specSelectionSchema).max(10).optional().default([]),
});

/** 客户端传入的金额字段不参与任何计算，由 Zod 默认剥离未知键。 */
export const createOrderSchema = z.object({
  tableToken: z.string().min(1).max(128),
  items: z.array(orderItemSchema).min(1).max(50),
  remark: z.string().max(200).optional().default(''),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
