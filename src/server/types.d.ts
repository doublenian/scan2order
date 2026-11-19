import type { AdminIdentity, OrderSnapshot, VisitorIdentity } from './context.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      admin?: AdminIdentity;
      visitor?: VisitorIdentity;
      /** 订单路由在鉴权后解析出的订单快照，避免重复查询。 */
      orderSnapshot?: OrderSnapshot;
    }
  }
}

export {};
