import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import type { AppContext } from '../../context.js';
import { businessDate, businessDayRange } from '../../db/client.js';
import { conflict, notFound } from '../../domain/errors.js';
import { accountInputSchema, idParamSchema, paginationSchema } from '../../domain/schemas.js';
import { success } from '../../middleware/error-handler.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import {
  createAccount, disableAccount, findAdminById, listAccounts, toAccountDto, updateAccount,
} from '../../repositories/accounts.js';
import { listCustomers } from '../../repositories/customers.js';
import { getOverview } from '../../repositories/orders.js';

const accountUpdateSchema = z.object({
  password: z.string().min(8).max(128).optional(),
  realName: z.string().min(1).max(64),
  role: z.enum(['admin', 'staff']),
  status: z.enum(['active', 'disabled']).optional(),
});

export function createAdminMiscRouter(ctx: AppContext): Router {
  const router = Router();
  const db = ctx.db;

  router.get('/admin/users', validateQuery(paginationSchema), (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    success(res, listCustomers(db, page, pageSize));
  });

  router.get('/admin/accounts', validateQuery(paginationSchema), (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number };
    success(res, listAccounts(db, page, pageSize));
  });

  router.post('/admin/accounts', validateBody(accountInputSchema), (req, res) => {
    const input = req.body as {
      username: string; password?: string; realName: string;
      role: 'admin' | 'staff'; status: 'active' | 'disabled';
    };
    if (!input.password) throw conflict('新建账号必须设置初始密码');
    const id = createAccount(db, input.username, bcrypt.hashSync(input.password, 10),
      input.realName, input.role);
    success(res, toAccountDto(findAdminById(db, id)!), 'created', 201);
  });

  router.put('/admin/accounts/:id', validateBody(accountUpdateSchema), (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const account = findAdminById(db, id);
    if (!account) throw notFound('账号不存在');
    const input = req.body as {
      password?: string; realName: string; role: 'admin' | 'staff'; status?: 'active' | 'disabled';
    };
    if (id === req.admin!.id && (input.role !== 'admin' || input.status === 'disabled')) {
      throw conflict('不能修改当前登录账号的角色或停用自己');
    }
    updateAccount(db, id, input.realName, input.role, input.status ?? account.status as 'active' | 'disabled',
      input.password ? bcrypt.hashSync(input.password, 10) : undefined);
    success(res, toAccountDto(findAdminById(db, id)!));
  });

  router.delete('/admin/accounts/:id', (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!findAdminById(db, id)) throw notFound('账号不存在');
    if (id === req.admin!.id) throw conflict('不能停用当前登录账号');
    disableAccount(db, id);
    success(res, { deleted: true });
  });

  router.get('/admin/stats/overview', (_req, res) => {
    const date = businessDate();
    const { start, end } = businessDayRange(date);
    success(res, getOverview(db, date, start, end));
  });

  return router;
}
