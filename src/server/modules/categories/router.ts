import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { success } from '../../middleware/error-handler.js';
import { listActiveCategoriesWithCounts } from '../../repositories/catalog.js';

export function createCategoriesRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/categories', (_req, res) => {
    success(res, { items: listActiveCategoriesWithCounts(ctx.db) });
  });

  return router;
}
