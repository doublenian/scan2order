import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { badRequest } from '../domain/errors.js';

type ParseResult = { ok: true; data: unknown } | { ok: false };

function parseOrNext(schema: ZodType, value: unknown, next: NextFunction): ParseResult {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  next(badRequest('参数错误', result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))));
  return { ok: false };
}

export function validateBody(schema: ZodType): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = parseOrNext(schema, req.body, next);
    if (!parsed.ok) return;
    req.body = parsed.data;
    next();
  };
}

export function validateQuery(schema: ZodType): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = parseOrNext(schema, req.query, next);
    if (!parsed.ok) return;
    req.query = parsed.data as Request['query'];
    next();
  };
}
