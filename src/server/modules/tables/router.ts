import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { notFound } from '../../domain/errors.js';
import { z } from 'zod';
import { validateQuery } from '../../middleware/validate.js';
import { success } from '../../middleware/error-handler.js';
import { findActiveTableByToken } from '../../repositories/tables.js';

const resolveSchema = z.object({ token: z.string().min(1).max(128) });

export function createTablesRouter(ctx: AppContext): Router {
  const router = Router();

  router.get('/tables/resolve', validateQuery(resolveSchema), (req, res) => {
    const { token } = req.query as { token: string };
    const table = findActiveTableByToken(ctx.db, token);
    if (!table) throw notFound('桌台不存在、二维码已失效或桌台已停用');
    success(res, { id: table.id, tableNo: table.table_no, status: table.status });
  });

  return router;
}
