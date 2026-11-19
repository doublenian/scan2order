import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { notFound } from '../../domain/errors.js';
import { idParamSchema, paginationSchema, tableInputSchema } from '../../domain/schemas.js';
import { success } from '../../middleware/error-handler.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  createTable, findTableById, listTables, regenerateQrToken, softDeleteTable,
  toTableDto, updateTable,
} from '../../repositories/tables.js';

export function createAdminTablesRouter(ctx: AppContext): Router {
  const router = Router();
  const db = ctx.db;
  const baseUrl = ctx.config.h5BaseUrl;

  router.get('/admin/tables', validateQuery(paginationSchema), (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    success(res, listTables(db, baseUrl, page, pageSize));
  });

  router.post('/admin/tables', validateBody(tableInputSchema), (req, res) => {
    const input = req.body as { tableNo: string; status: 'active' | 'disabled' };
    const table = createTable(db, input.tableNo);
    if (input.status === 'disabled') updateTable(db, table.id, table.table_no, 'disabled');
    success(res, toTableDto(findTableById(db, table.id)!, baseUrl), 'created', 201);
  });

  router.put('/admin/tables/:id', validateBody(tableInputSchema), (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findTableById(db, id) || findTableById(db, id)!.deleted_at) throw notFound('桌台不存在');
    const input = req.body as { tableNo: string; status: 'active' | 'disabled' };
    updateTable(db, id, input.tableNo, input.status);
    success(res, toTableDto(findTableById(db, id)!, baseUrl));
  });

  router.delete('/admin/tables/:id', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findTableById(db, id) || findTableById(db, id)!.deleted_at) throw notFound('桌台不存在');
    softDeleteTable(db, id);
    success(res, { deleted: true });
  });

  router.post('/admin/tables/:id/qr', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findTableById(db, id) || findTableById(db, id)!.deleted_at) throw notFound('桌台不存在');
    const table = regenerateQrToken(db, id);
    success(res, { id: table.id, qrToken: table.qr_token, qrUrl: toTableDto(table, baseUrl).qrUrl });
  });

  return router;
}
