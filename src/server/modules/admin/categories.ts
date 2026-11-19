import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { conflict, notFound } from '../../domain/errors.js';
import { categoryInputSchema, idParamSchema, paginationSchema } from '../../domain/schemas.js';
import { success } from '../../middleware/error-handler.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  createCategory, findCategoryById, listCategories, softDeleteCategory, updateCategory,
} from '../../repositories/catalog.js';

export function createAdminCategoriesRouter(ctx: AppContext): Router {
  const router = Router();
  const db = ctx.db;

  router.get('/admin/categories', validateQuery(paginationSchema), (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    success(res, listCategories(db, page, pageSize));
  });

  router.post('/admin/categories', validateBody(categoryInputSchema), (req, res) => {
    const input = req.body as { name: string; sortOrder: number; status: 'active' | 'disabled' };
    success(res, createCategory(db, input.name, input.sortOrder, input.status), 'created', 201);
  });

  router.put('/admin/categories/:id', validateBody(categoryInputSchema), (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findCategoryById(db, id)) throw notFound('分类不存在');
    const input = req.body as { name: string; sortOrder: number; status: 'active' | 'disabled' };
    updateCategory(db, id, input.name, input.sortOrder, input.status);
    success(res, findCategoryById(db, id));
  });

  router.delete('/admin/categories/:id', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findCategoryById(db, id)) throw notFound('分类不存在');
    const count = (db.prepare(
      'SELECT COUNT(*) AS count FROM dishes WHERE category_id = ? AND deleted_at IS NULL',
    ).get(id) as { count: number }).count;
    if (count > 0) throw conflict('该分类下仍有菜品，请先移动或删除菜品');
    softDeleteCategory(db, id);
    success(res, { deleted: true });
  });

  return router;
}
