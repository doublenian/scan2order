import type { ServerConfig } from './config.js';
import type { Db } from './db/client.js';
import type { OrderStatus, PaymentStatus } from './domain/order-state.js';

export interface AdminIdentity {
  id: number;
  username: string;
  realName: string;
  role: 'admin' | 'staff';
}

export interface VisitorIdentity {
  id: number;
  visitorTokenHash: string;
}

export interface OrderSnapshot {
  id: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerId: number;
  totalCents: number;
}

/** 请求处理所需依赖，由 app 工厂注入，便于测试使用内存库与固定密钥。 */
export interface AppContext {
  db: Db;
  jwtSecret: string;
  config: Pick<
    ServerConfig,
    'corsOrigins' | 'h5BaseUrl' | 'uploadDir' | 'maxUploadMb' | 'nodeEnv' | 'jwtExpiresIn'
  >;
}
