import 'dotenv/config';

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  databasePath: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  h5BaseUrl: string;
  uploadDir: string;
  maxUploadMb: number;
}

export function getConfig(): ServerConfig {
  const corsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    port: Number(process.env.PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    databasePath: process.env.DATABASE_PATH ?? './data/scan2order.db',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    corsOrigins,
    h5BaseUrl: process.env.H5_BASE_URL ?? corsOrigins[0] ?? 'http://localhost:5173',
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
    maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 2),
  };
}

/** JWT 密钥只从环境变量读取；缺失或占位符时拒绝启动，避免弱密钥上线。 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'REPLACE_WITH_A_RANDOM_SECRET' || secret.length < 16) {
    throw new Error('JWT_SECRET 必须通过环境变量配置，且长度不少于 16 位');
  }
  return secret;
}

/** 种子管理员凭据只从环境变量读取，不允许代码内默认密码。 */
export function getSeedAdmin(): { username: string; password: string } {
  const username = process.env.SEED_ADMIN_USERNAME?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!username || !password || password.length < 8) {
    throw new Error('请通过 SEED_ADMIN_USERNAME 与 SEED_ADMIN_PASSWORD 提供初始管理员（密码至少 8 位）');
  }
  return { username, password };
}
