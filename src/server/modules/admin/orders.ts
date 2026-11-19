import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { notFound } from '../../domain/errors.js';
import {
  idParamSchema, paginationSchema, statusQuerySchema,
} from '../../domain/schemas.js';
import { success } from '../../middleware/error-handler.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  findOrderRow, getOrderDetail, listOrdersForAdmin,
} from '../../repositories/orders.js';
import { cancelOrder, transitionOrder } from '../orders/order-service.js';

const filterSchema = paginationSchema.extend({
  status: statusQuerySchema.optional(),
  tableId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().max(40).optional(),
  dateTo: z.string().max(40).optional(),
});

const statusBodySchema = z.object({ status: statusQuerySchema });

export function createAdminOrdersRouter(ctx: AppContext): Router {
  const router = Router();
  const db = ctx.db;

  router.get('/admin/orders', validateQuery(filterSchema), (req, res) => {
    const query = req.query as unknown as {
      status?: 'PENDING_PAYMENT' | 'PAID' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
      tableId?: number; dateFrom?: string; dateTo?: string; page: number; pageSize: number;
    };
    success(res, listOrdersForAdmin(db, query, query.page, query.pageSize));
  });

  router.get('/admin/orders/:id', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findOrderRow(db, id)) throw notFound('订单不存在');
    success(res, getOrderDetail(db, id));
  });

  router.patch('/admin/orders/:id/status', validateBody(statusBodySchema), (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const order = findOrderRow(db, id);
    if (!order) throw notFound('订单不存在');
    transitionOrder(db, order, (req.body as { status: typeof order.status }).status);
    success(res, getOrderDetail(db, id));
  });

  router.post('/admin/orders/:id/cancel', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const order = findOrderRow(db, id);
    if (!order) throw notFound('订单不存在');
    cancelOrder(db, order);
    success(res, getOrderDetail(db, id));
  });

  return router;
}
