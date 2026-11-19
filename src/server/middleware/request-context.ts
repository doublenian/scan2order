import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** 为每个请求分配 requestId，输出结构化访问日志（不记录请求体，避免敏感信息入日志）。 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    const entry = {
      time: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : 'info',
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    };
    console.log(JSON.stringify(entry));
  });
  next();
}
