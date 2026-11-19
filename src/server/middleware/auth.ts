import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { AdminIdentity, AppContext, VisitorIdentity } from '../context.js';
import { forbidden, unauthorized } from '../domain/errors.js';
import { hashVisitorToken } from '../domain/token.js';

const COOKIE_NAME = 's2o_admin';

interface AdminJwtPayload {
  sub: string;
  username: string;
  role: 'admin' | 'staff';
}

function extractJwt(req: Request): string | undefined {
  const header = req.get('Authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[COOKIE_NAME];
  return cookieToken || undefined;
}

function verifyAdmin(ctx: AppContext, req: Request): AdminIdentity {
  const token = extractJwt(req);
  if (!token) throw unauthorized('请先登录管理后台');

  let payload: AdminJwtPayload;
  try {
    payload = jwt.verify(token, ctx.jwtSecret) as AdminJwtPayload;
  } catch {
    throw unauthorized('登录凭证已失效，请重新登录');
  }

  const row = ctx.db.prepare(
    `SELECT id, username, real_name, role, status FROM admin_users WHERE id = ?`,
  ).get(Number(payload.sub)) as
    | { id: number; username: string; real_name: string; role: 'admin' | 'staff'; status: string }
    | undefined;

  if (!row || row.status !== 'active') throw unauthorized('账号不存在或已停用');
  return { id: row.id, username: row.username, realName: row.real_name, role: row.role };
}

export function requireAdmin(ctx: AppContext): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const admin = verifyAdmin(ctx, req);
      if (admin.role !== 'admin') throw forbidden('该操作仅管理员可用');
      req.admin = admin;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Admin 与 Staff 均可访问（只读订单等）。 */
export function requireStaff(ctx: AppContext): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.admin = verifyAdmin(ctx, req);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function resolveVisitor(ctx: AppContext, req: Request): VisitorIdentity {
  const raw = req.get('X-Visitor-Token');
  if (!raw) throw unauthorized('缺少顾客凭证，请重新进入页面');

  const hash = hashVisitorToken(raw);
  const row = ctx.db.prepare(
    `SELECT id, visitor_token_hash FROM customers WHERE visitor_token_hash = ? AND status = 'active'`,
  ).get(hash) as { id: number; visitor_token_hash: string } | undefined;
  if (!row) throw unauthorized('顾客凭证无效，请重新进入页面');

  return { id: row.id, visitorTokenHash: row.visitor_token_hash };
}

export function requireVisitor(ctx: AppContext): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.visitor = resolveVisitor(ctx, req);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * 订单详情 / 支付：后台账号凭 JWT 可访问全部订单；顾客凭 X-Visitor-Token 仅可访问本人订单。
 * 只要携带了任一后台凭证（Cookie 或 Bearer）即按 JWT 校验，避免凭证无效时静默降级。
 */
export function requireVisitorOrStaff(ctx: AppContext): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (extractJwt(req)) {
        req.admin = verifyAdmin(ctx, req);
      } else {
        req.visitor = resolveVisitor(ctx, req);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export { COOKIE_NAME };
