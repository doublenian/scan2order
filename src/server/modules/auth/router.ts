import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AppContext } from '../../context.js';
import { unauthorized } from '../../domain/errors.js';
import { loginSchema } from '../../domain/schemas.js';
import { COOKIE_NAME, requireStaff } from '../../middleware/auth.js';
import { success } from '../../middleware/error-handler.js';
import { validateBody } from '../../middleware/validate.js';
import { findAdminByUsername, toAccountDto, touchLastLogin } from '../../repositories/accounts.js';

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();

  router.post('/auth/login', validateBody(loginSchema), (req, res) => {
    const { username, password } = req.body as { username: string; password: string };
    const admin = findAdminByUsername(ctx.db, username);
    if (!admin || admin.status !== 'active' || !bcrypt.compareSync(password, admin.password_hash)) {
      throw unauthorized('用户名或密码错误');
    }

    touchLastLogin(ctx.db, admin.id);
    const token = jwt.sign(
      { sub: String(admin.id), username: admin.username, role: admin.role },
      ctx.jwtSecret,
      { expiresIn: ctx.config.jwtExpiresIn } as jwt.SignOptions,
    );
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: ctx.config.nodeEnv === 'production',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
    });
    success(res, toAccountDto(admin));
  });

  router.post('/auth/logout', requireStaff(ctx), (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    success(res, { loggedOut: true });
  });

  router.get('/auth/me', requireStaff(ctx), (req, res) => {
    success(res, {
      id: req.admin!.id,
      username: req.admin!.username,
      realName: req.admin!.realName,
      role: req.admin!.role,
    });
  });

  return router;
}
