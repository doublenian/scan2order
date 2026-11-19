import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { notFound } from '../../domain/errors.js';
import { paginationSchema, idParamSchema } from '../../domain/schemas.js';
import { success } from '../../middleware/error-handler.js';
import { validateQuery } from '../../middleware/validate.js';
import {
  findDishById, listDishes, listSpecsByDishIds, toDishDto, toSpecDto,
} from '../../repositories/catalog.js';

const listSchema = paginationSchema.extend({
  categoryId: z.coerce.number().int().positive().optional(),
  keyword: z.string().max(100).optional(),
});

export function createDishesRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/dishes', validateQuery(listSchema), (req, res) => {
    const { categoryId, keyword, page, pageSize } = req.query as unknown as {
      categoryId?: number; keyword?: string; page: number; pageSize: number;
    };
    success(res, listDishes(ctx.db, { categoryId, keyword }, page, pageSize));
  });

  router.get('/dishes/:id', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const dish = findDishById(ctx.db, id);
    if (!dish) throw notFound('菜品不存在');
    const specs = listSpecsByDishIds(ctx.db, [id]).map(toSpecDto);
    success(res, toDishDto(dish, specs));
  });

  return router;
}
