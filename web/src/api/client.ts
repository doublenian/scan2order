export class ApiError extends Error {
  constructor(
    readonly code: string | number,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = '/api/v1';
const VISITOR_KEY = 's2o_visitor_token';

export function getVisitorToken(): string | null {
  return localStorage.getItem(VISITOR_KEY);
}

export function setVisitorToken(token: string): void {
  localStorage.setItem(VISITOR_KEY, token);
}

export async function ensureVisitorToken(): Promise<string> {
  const existing = getVisitorToken();
  if (existing) return existing;
  const res = await fetch(`${API_BASE}/visitors`, { method: 'POST', credentials: 'include' });
  const json = await res.json();
  if (!res.ok) throw new ApiError(json.code, json.message, res.status);
  const token = json.data.visitorToken as string;
  setVisitorToken(token);
  return token;
}

export interface ListData<T> {
  total: number;
  items: T[];
  page: number;
  pageSize: number;
}

interface Envelope<T> {
  code: number | string;
  message: string;
  data: T;
  requestId: string;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; visitor?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const init: RequestInit = { method: options.method ?? 'GET', credentials: 'include', headers };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (options.visitor) {
    const token = getVisitorToken();
    if (token) headers['X-Visitor-Token'] = token;
  }
  if (options.signal) init.signal = options.signal;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError('NETWORK', '网络异常，请稍后重试', 0);
  }
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok) {
    if (res.status === 401 && options.visitor) {
      localStorage.removeItem(VISITOR_KEY);
    }
    throw new ApiError(json.code, json.message, res.status);
  }
  return json.data;
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  return `¥${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export const STATUS_TEXT: Record<string, string> = {
  PENDING_PAYMENT: '待支付',
  PAID: '已支付',
  PREPARING: '制作中',
  READY: '待取餐',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};
