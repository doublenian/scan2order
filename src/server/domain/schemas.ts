import { z } from 'zod';
import { ORDER_STATUSES } from './order-state.js';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const statusQuerySchema = z.enum(ORDER_STATUSES);

export const idParamSchema = z.coerce.number().int().positive();

export const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const categoryInputSchema = z.object({
  name: z.string().min(1).max(64),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  status: z.enum(['active', 'disabled']).optional().default('active'),
});

export const dishOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(64),
  extraPriceCents: z.number().int().min(0).max(1_000_000),
});

export const specInputSchema = z.object({
  name: z.string().min(1).max(64),
  options: z.array(dishOptionSchema).max(50).optional().default([]),
  extraPriceCents: z.number().int().min(0).max(1_000_000).optional().default(0),
  required: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
});

export const dishInputSchema = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(''),
  imageUrl: z.string().max(500).optional().default(''),
  priceYuan: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  priceCents: z.number().int().min(0).max(10_000_000).optional(),
  tags: z.array(z.string().min(1).max(32)).max(10).optional().default([]),
  status: z.enum(['on', 'soldout']).optional().default('on'),
  sortOrder: z.number().int().min(0).max(9999).optional().default(0),
  specs: z.array(specInputSchema).max(20).optional().default([]),
});

export const tableInputSchema = z.object({
  tableNo: z.string().min(1).max(32),
  status: z.enum(['active', 'disabled']).optional().default('active'),
});

export const accountInputSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(8).max(128).optional(),
  realName: z.string().min(1).max(64),
  role: z.enum(['admin', 'staff']),
  status: z.enum(['active', 'disabled']).optional().default('active'),
});
