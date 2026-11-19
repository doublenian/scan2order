import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { badRequest, notFound } from '../../domain/errors.js';
import { parseYuanToCents } from '../../domain/money.js';
import { dishInputSchema, idParamSchema, paginationSchema } from '../../domain/schemas.js';
import { success } from '../../middleware/error-handler.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  createDish, findCategoryById, findDishById, listAllDishesForAdmin, setDishStatus,
  softDeleteDish, updateDish, type DishInput,
} from '../../repositories/catalog.js';

export function createAdminDishesRouter(ctx: AppContext): Router {
  const router = Router();
  const db = ctx.db;

  router.get('/admin/dishes', validateQuery(paginationSchema), (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    success(res, listAllDishesForAdmin(db, page, pageSize));
  });

  router.post('/admin/dishes', validateBody(dishInputSchema), (req, res) => {
    const input = toDishInput(req.body);
    const id = createDish(db, input);
    success(res, findDishById(db, id, true), 'created', 201);
  });

  router.put('/admin/dishes/:id', validateBody(dishInputSchema), (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findDishById(db, id)) throw notFound('菜品不存在');
    updateDish(db, id, toDishInput(req.body));
    success(res, findDishById(db, id, true));
  });

  router.patch('/admin/dishes/:id/status', validateBody(
    z.object({ status: z.enum(['on', 'soldout']) }),
  ), (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findDishById(db, id)) throw notFound('菜品不存在');
    setDishStatus(db, id, (req.body as { status: 'on' | 'soldout' }).status);
    success(res, findDishById(db, id, true));
  });

  router.delete('/admin/dishes/:id', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findDishById(db, id)) throw notFound('菜品不存在');
    softDeleteDish(db, id);
    success(res, { deleted: true });
  });

  function toDishInput(body: unknown): DishInput {
    const input = body as {
      categoryId: number; name: string; description: string; imageUrl: string;
      priceYuan?: string; priceCents?: number; tags: string[];
      status: 'on' | 'soldout'; sortOrder: number;
      specs: DishInput['specs'];
    };
    if (!findCategoryById(db, input.categoryId)) throw badRequest('所属分类不存在');
    const priceCents = input.priceYuan !== undefined
      ? parseYuanToCents(input.priceYuan)
      : input.priceCents;
    if (priceCents === null || priceCents === undefined) throw badRequest('价格格式不正确');
    return {
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      imageUrl: input.imageUrl,
      priceCents,
      tags: input.tags,
      status: input.status,
      sortOrder: input.sortOrder,
      specs: input.specs,
    };
  }

  return router;
}
