import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, badRequest, conflict, notFound } from '../domain/errors.js';

export interface ApiEnvelope<T> {
  code: number | string;
  message: string;
  data: T | null;
  requestId: string;
}

export function success<T>(res: Response, data: T, message = 'ok', httpStatus = 200): void {
  const envelope: ApiEnvelope<T> = {
    code: 0,
    message,
    data,
    requestId: res.locals.requestId ?? res.getHeader('X-Request-Id') ?? '',
  };
  res.status(httpStatus).json(envelope);
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(notFound(`接口不存在：${req.method} ${req.path}`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId ?? '';
  let problem: AppError;

  if (err instanceof AppError) {
    problem = err;
  } else if (err instanceof ZodError) {
    problem = badRequest('参数错误', err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    })));
  } else if (isUniqueConstraint(err)) {
    problem = conflict('记录已存在或违反唯一约束');
  } else {
    console.error(JSON.stringify({
      time: new Date().toISOString(),
      level: 'error',
      requestId,
      message: err instanceof Error ? err.message : '未预期错误',
    }));
    problem = new AppError(500, 'INTERNAL', '服务器内部错误');
  }

  const envelope: ApiEnvelope<null> & { details?: unknown } = {
    code: problem.code,
    message: problem.message,
    data: null,
    requestId,
  };
  if (problem.details !== undefined) {
    envelope.details = problem.details;
  }
  res.status(problem.httpStatus).json(envelope);
}

function isUniqueConstraint(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string' &&
    (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT')
  );
}
