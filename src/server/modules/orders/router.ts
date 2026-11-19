import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { badRequest, forbidden, notFound } from '../../domain/errors.js';
import { calculateTotalCents, calculateUnitPriceCents } from '../../domain/money.js';
import { idParamSchema, paginationSchema } from '../../domain/schemas.js';
import { generateOrderNo } from '../../domain/token.js';
import { requireVisitor, requireVisitorOrStaff } from '../../middleware/auth.js';
import { success } from '../../middleware/error-handler.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  findDishesByIds, findSpecById, listSpecsByDishIds,
} from '../../repositories/catalog.js';
import {
  findOrderRow, getOrderDetail, insertOrder, insertOrderItem,
  listOrdersForCustomer, type NewOrder,
} from '../../repositories/orders.js';
import { findActiveTableByToken } from '../../repositories/tables.js';
import { businessDate, nowIso } from '../../db/client.js';
import { payOrder } from './order-service.js';
import { createOrderSchema, type CreateOrderInput, type SpecSnapshot } from './order-types.js';

export function createOrdersRouter(ctx: AppContext): Router {
  const router = Router();
  const db = ctx.db;

  router.post('/orders', requireVisitor(ctx), validateBody(createOrderSchema), (req, res) => {
    const input = req.body as CreateOrderInput;
    const customerId = req.visitor!.id;
    const orderId = db.transaction(() => createOrderTransaction(db, input, customerId)).immediate();
    success(res, getOrderDetail(db, orderId), 'created', 201);
  });

  router.get('/orders/mine', requireVisitor(ctx), validateQuery(paginationSchema), (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    success(res, listOrdersForCustomer(db, req.visitor!.id, page, pageSize));
  });

  router.get('/orders/:id', requireVisitorOrStaff(ctx), (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    assertOrderAccess(req, getOrderRowForAccess(id));
    success(res, getOrderDetail(db, id));
  });

  router.post('/orders/:id/pay', requireVisitorOrStaff(ctx), (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const order = getOrderRowForAccess(id);
    assertOrderAccess(req, order);
    payOrder(db, order);
    success(res, getOrderDetail(db, id));
  });

  function getOrderRowForAccess(id: number) {
    const order = findOrderRow(db, id);
    if (!order) throw notFound('订单不存在');
    return order;
  }

  return router;
}

function assertOrderAccess(
  req: { admin?: { id: number }; visitor?: { id: number } },
  order: { customer_id: number },
): void {
  if (req.admin) return;
  if (!req.visitor || req.visitor.id !== order.customer_id) {
    throw forbidden('无权访问他人订单');
  }
}

function createOrderTransaction(
  db: AppContext['db'], input: CreateOrderInput, customerId: number,
): number {
  const table = findActiveTableByToken(db, input.tableToken);
  if (!table) throw notFound('桌台不存在、二维码已失效或桌台已停用');

  const dishIds = [...new Set(input.items.map((item) => item.dishId))];
  const dishes = findDishesByIds(db, dishIds);
  const dishMap = new Map(dishes.map((dish) => [dish.id, dish]));
  for (const item of input.items) {
    const dish = dishMap.get(item.dishId);
    if (!dish) throw badRequest(`菜品不存在：${item.dishId}`);
    if (dish.status === 'soldout') throw badRequest(`菜品「${dish.name}」已售罄`);
  }

  const specs = listSpecsByDishIds(db, dishIds);
  const specMap = new Map(specs.map((spec) => [spec.id, spec]));

  const pricedItems = input.items.map((item) => {
    const dish = dishMap.get(item.dishId)!;
    const selectedSpecIds = new Set<number>();
    let specFixedExtra = 0;
    const snapshots: SpecSnapshot[] = [];

    for (const selection of item.specSelections) {
      if (selectedSpecIds.has(selection.specId)) {
        throw badRequest('同一规格不可重复选择');
      }
      const spec = specMap.get(selection.specId);
      if (!spec || spec.dish_id !== dish.id) {
        throw badRequest(`菜品「${dish.name}」不存在该规格`);
      }
      const option = spec.options_json
        ? JSON.parse(spec.options_json) as { id: string; label: string; extraPriceCents: number }[]
        : [];
      const matched = option.find((entry) => entry.id === selection.optionId);
      if (!matched) throw badRequest(`规格「${spec.name}」的选项无效`);

      selectedSpecIds.add(spec.id);
      specFixedExtra += spec.extra_price_cents;
      snapshots.push({
        specId: spec.id,
        specName: spec.name,
        optionId: matched.id,
        optionLabel: matched.label,
        extraPriceCents: matched.extraPriceCents,
      });
    }

    for (const spec of specs.filter((entry) => entry.dish_id === dish.id)) {
      if (spec.required === 1 && !selectedSpecIds.has(spec.id)) {
        throw badRequest(`请选择菜品「${dish.name}」的必选规格「${spec.name}」`);
      }
    }

    const unitPriceCents = calculateUnitPriceCents(
      dish.price_cents,
      specFixedExtra,
      snapshots.map((snapshot) => ({ extraPriceCents: snapshot.extraPriceCents })),
    );
    return { dish, unitPriceCents, quantity: item.quantity, snapshots };
  });

  const totalCents = calculateTotalCents(pricedItems);
  const createdAt = nowIso();
  const orderNoDate = businessDate().replace(/-/g, '');
  const orderInput: NewOrder = {
    orderNo: generateOrderNo(orderNoDate),
    tableId: table.id,
    customerId,
    totalCents,
    remark: input.remark ?? '',
    orderNoCreatedAt: createdAt,
  };

  const orderId = insertOrderWithRetry(db, orderInput, 0);
  for (const item of pricedItems) {
    insertOrderItem(db, {
      orderId,
      dishId: item.dish.id,
      dishNameSnapshot: item.dish.name,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      specSnapshot: item.snapshots,
    });
  }
  return orderId;
}

function insertOrderWithRetry(db: AppContext['db'], input: NewOrder, attempt: number): number {
  try {
    return insertOrder(db, { ...input, orderNo: generateOrderNo(input.orderNo.slice(3, 11)) });
  } catch (error) {
    if (attempt < 2 && isUniqueError(error)) {
      return insertOrderWithRetry(db, input, attempt + 1);
    }
    throw error;
  }
}

function isUniqueError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    String((error as { code: unknown }).code).startsWith('SQLITE_CONSTRAINT');
}
