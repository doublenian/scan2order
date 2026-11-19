import { Router } from 'express';
import type { AppContext } from '../../context.js';
import { generateVisitorToken, hashVisitorToken } from '../../domain/token.js';
import { createCustomer, findCustomerByHash } from '../../repositories/customers.js';
import { success } from '../../middleware/error-handler.js';

export function createVisitorsRouter(ctx: AppContext): Router {
  const router = Router();

  router.post('/visitors', (req, res) => {
    let token = generateVisitorToken();
    let hash = hashVisitorToken(token);
    if (findCustomerByHash(ctx.db, hash)) {
      token = generateVisitorToken();
      hash = hashVisitorToken(token);
    }
    createCustomer(ctx.db, hash);
    success(res, { visitorToken: token }, 'created', 201);
  });

  return router;
}
