export type ErrorCode =
  | 'INVALID_PARAM'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL';

export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(httpStatus: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'INVALID_PARAM', message, details);

export const unauthorized = (message = '未认证或凭证已失效') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = '无权限访问') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (message = '资源不存在') =>
  new AppError(404, 'NOT_FOUND', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);
