import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { AppContext } from './context.js';
import { forbidden } from './domain/errors.js';
import { requireAdmin, requireStaff } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestContext } from './middleware/request-context.js';
import { createAdminCategoriesRouter } from './modules/admin/categories.js';
import { createAdminDishesRouter } from './modules/admin/dishes.js';
import { createAdminMiscRouter } from './modules/admin/misc.js';
import { createAdminOrdersRouter } from './modules/admin/orders.js';
import { createAdminTablesRouter } from './modules/admin/tables.js';
import { createAuthRouter } from './modules/auth/router.js';
import { createCategoriesRouter } from './modules/categories/router.js';
import { createDishesRouter } from './modules/dishes/router.js';
import { createOrdersRouter } from './modules/orders/router.js';
import { createTablesRouter } from './modules/tables/router.js';
import { createUploadsRouter } from './modules/uploads/router.js';
import { createVisitorsRouter } from './modules/visitors/router.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || ctx.config.corsOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '128kb' }));
  app.use(express.urlencoded({ extended: false, limit: '128kb' }));
  app.use(cookieParser());
  app.use(requestContext);

  app.use('/api/v1', (req: Request, _res: Response, next: NextFunction) => {
    if (!WRITE_METHODS.has(req.method)) return next();
    const origin = req.get('Origin');
    if (!origin) return next();
    const sameOrigin = `${req.protocol}://${req.get('host')}`;
    if (ctx.config.corsOrigins.includes(origin) || origin === sameOrigin) return next();
    next(forbidden('Origin 不在允许列表中'));
  });

  const api = express.Router();

  // 公开接口
  api.use(createVisitorsRouter(ctx));
  api.use(createTablesRouter(ctx));
  api.use(createCategoriesRouter(ctx));
  api.use(createDishesRouter(ctx));
  api.use(createOrdersRouter(ctx));
  api.use(createAuthRouter(ctx));

  // 管理端：订单读写 Admin/Staff 均可；其余仅 Admin
  const staffOnly = express.Router();
  staffOnly.use(requireStaff(ctx));
  staffOnly.use(createAdminOrdersRouter(ctx));

  const adminOnly = express.Router();
  adminOnly.use(requireAdmin(ctx));
  adminOnly.use(createAdminCategoriesRouter(ctx));
  adminOnly.use(createAdminDishesRouter(ctx));
  adminOnly.use(createAdminTablesRouter(ctx));
  adminOnly.use(createAdminMiscRouter(ctx));
  adminOnly.use(createUploadsRouter(ctx));

  api.use(staffOnly);
  api.use(adminOnly);

  app.use('/api/v1', api);

  // 图片静态资源：仅白名单扩展名
  app.use('/uploads', (req, res, next) => {
    if (!/\.(jpg|png|webp)$/i.test(req.path)) return next();
    next();
  }, express.static(ctx.config.uploadDir, { dotfiles: 'deny', immutable: true, maxAge: '1d' }));

  const webDist = resolve(process.cwd(), 'dist/web');
  if (existsSync(join(webDist, 'index.html'))) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
        notFoundHandler(req, res, next);
        return;
      }
      res.sendFile(join(webDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
