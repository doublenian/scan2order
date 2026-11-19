# 扫码点餐系统（scan2order）

Node.js + Express + SQLite 后端，React H5 顾客端与商家管理端。顾客扫码解析桌台后浏览菜单、加购、下单、模拟支付并查看订单；商家在管理端维护分类、菜品、桌台、订单、顾客与后台账号。

> 支付为**模拟支付**，不接任何真实支付网关、不产生资金流、不提供退款。

## 环境要求

- Node.js ≥ 20（推荐 20 LTS 或 22）
- npm ≥ 9

## 本地启动

```bash
npm install
cp .env.example .env
# 编辑 .env：设置 JWT_SECRET、SEED_ADMIN_USERNAME、SEED_ADMIN_PASSWORD
npm run db:migrate
npm run db:seed
npm run dev:api      # 终端 A：API http://localhost:3000
npm run dev:web      # 终端 B：H5/管理端 http://localhost:5173
```

`db:seed` 会打印可直接打开的桌台二维码链接（如 `http://localhost:5173/?tableToken=...`），并创建初始管理员。管理员密码只从环境变量读取，不提供默认值，也不会打印到日志。

## 生产运行

```bash
npm install
npm run build
# 提供 JWT_SECRET 等环境变量后：
npm start
```

`npm start` 由 Node 同时提供 `/api/v1`、`/uploads/*` 与 SPA 静态资源（SPA fallback 到 `index.html`）。

## 测试与校验

```bash
npm test              # Vitest 单元 + Supertest API 集成测试
npm run typecheck     # 服务端与前端类型检查
npm run build         # 前端构建 + 服务端编译
npm audit --omit=dev  # 生产依赖安全审计
```

## 环境变量

见 `.env.example`。要点：

| 变量 | 说明 |
| --- | --- |
| `JWT_SECRET` | 必填且长度 ≥16，占位符会被拒绝启动；请勿提交真实值 |
| `DATABASE_PATH` | SQLite 文件路径，默认 `./data/scan2order.db` |
| `CORS_ORIGINS` | 允许的来源，逗号分隔；写操作还会校验 `Origin` 或同源请求 |
| `H5_BASE_URL` | 桌台二维码指向的 H5 基地址 |
| `TZ` | 业务日时区，默认 `Asia/Shanghai` |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | 仅供 `db:seed` 读取，密码至少 8 位 |

`.env`、`data/`、`uploads/` 均在 `.gitignore` 中。

## API 约定

- 前缀 `/api/v1`；统一包络 `{ code, message, data, requestId }`，成功 `code=0`。
- 错误码映射：400 `INVALID_PARAM`、401 `UNAUTHORIZED`、403 `FORBIDDEN`、404 `NOT_FOUND`、409 `CONFLICT`、500 `INTERNAL`。
- 列表参数 `page`（从 1 起）、`pageSize`（1–100），返回 `{ total, items, page, pageSize }`。
- 金额一律为整数分（字段后缀 `Cents`），后端重算，忽略客户端传入金额。
- 顾客凭证通过 `X-Visitor-Token` 传递（`POST /orders` 也兼容 body，但 header 优先）；后台 JWT 通过 `HttpOnly` Cookie `s2o_admin` 传递，`Authorization: Bearer` 兼容接口测试。

主要端点：

| 方法 | 路径 | 鉴权 |
| --- | --- | --- |
| POST | `/api/v1/visitors` | 公开 |
| GET | `/api/v1/tables/resolve?token=` | 公开 |
| GET | `/api/v1/categories`、`/api/v1/dishes`、`/api/v1/dishes/:id` | 公开 |
| POST | `/api/v1/orders` | Visitor |
| GET | `/api/v1/orders/mine`、`/api/v1/orders/:id` | Visitor / JWT |
| POST | `/api/v1/orders/:id/pay` | Visitor / JWT |
| POST | `/api/v1/auth/login`、`/auth/logout`、`GET /auth/me` | 公开 / JWT |
| GET/POST/PUT/DELETE | `/api/v1/admin/categories`、`dishes`、`tables` | Admin |
| PATCH | `/api/v1/admin/dishes/:id/status` | Admin |
| POST | `/api/v1/admin/tables/:id/qr` | Admin |
| GET/PATCH/POST | `/api/v1/admin/orders`、`/:id/status`、`/:id/cancel` | Admin/Staff |
| GET | `/api/v1/admin/users`、`/admin/stats/overview` | Admin |
| GET/POST/PUT/DELETE | `/api/v1/admin/accounts` | Admin |
| POST | `/api/v1/admin/uploads` | Admin |

## 数据一致性

- 订单状态机：`PENDING_PAYMENT → PAID → PREPARING → READY → COMPLETED`；`PENDING_PAYMENT/PAID` 可取消，`PREPARING` 起禁止取消；非法流转返回 409。
- 创建订单在单个 SQLite 事务中完成校验、计价与写入；任一步失败全量回滚。
- `order_items` 保存下单时的菜品名称、单价与规格快照；后续改价不影响历史订单。
- 顾客令牌在数据库只存 SHA-256 哈希；后台密码使用 bcrypt 哈希。

## 已知边界

- 规格为 v1「单组单选」，管理端页面提供基础新增与上下架，规格明细通过 API 的 `specs` 字段维护。
- 订单状态通过轮询/手动刷新查看，不引入 WebSocket。
- 图片上传落地本地 `UPLOAD_DIR`，部署时需自行挂载持久卷。
