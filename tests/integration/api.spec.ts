import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/server/app.js';
import { createDb, migrate, nowIso, type Db } from '../../src/server/db/client.js';
import { hashVisitorToken } from '../../src/server/domain/token.js';

const JWT_SECRET = 'integration-test-jwt-secret-0123456789';
const ADMIN_PASSWORD = 'AdminPass123';
const STAFF_PASSWORD = 'StaffPass123';

interface Fixture {
  db: Db;
  app: Express;
  adminCookie: string[];
  staffCookie: string[];
  visitorA: string;
  visitorB: string;
  tableA: string;
  tableB: string;
  categoryId: number;
  dishA: number;
  dishB: number;
  soldoutDish: number;
  specLarge: number;
  tableARowId: number;
}

let f: Fixture;

beforeEach(async () => {
  const db = createDb(':memory:');
  migrate(db);
  const now = nowIso();

  db.prepare(
    `INSERT INTO admin_users (username, password_hash, real_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run('admin', bcrypt.hashSync(ADMIN_PASSWORD, 10), '管理员', 'admin', now, now);
  db.prepare(
    `INSERT INTO admin_users (username, password_hash, real_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'active', ?, ?)`,
  ).run('staff', bcrypt.hashSync(STAFF_PASSWORD, 10), '店员', 'staff', now, now);

  const categoryId = Number(db.prepare(
    `INSERT INTO categories (name, sort_order, status, created_at, updated_at) VALUES ('热菜', 1, 'active', ?, ?)`,
  ).run(now, now).lastInsertRowid);

  const insertDish = db.prepare(
    `INSERT INTO dishes (category_id, name, description, image_url, price_cents, tags_json, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, '[]', ?, ?, ?, ?)`,
  );
  const dishA = Number(insertDish.run(categoryId, '宫保鸡丁', '微辣', 1500, 'on', 1, now, now).lastInsertRowid);
  const dishB = Number(insertDish.run(categoryId, '米饭', '主食', 800, 'on', 2, now, now).lastInsertRowid);
  const soldoutDish = Number(insertDish.run(categoryId, '售罄菜', '已售罄', 2000, 'soldout', 3, now, now).lastInsertRowid);

  const specLarge = Number(db.prepare(
    `INSERT INTO dish_specs (dish_id, name, options_json, extra_price_cents, required, sort_order, status, created_at, updated_at)
     VALUES (?, '份量', ?, 0, 0, 1, 'active', ?, ?)`,
  ).run(dishA, JSON.stringify([
    { id: 'small', label: '小份', extraPriceCents: 0 },
    { id: 'large', label: '大份', extraPriceCents: 200 },
  ]), now, now).lastInsertRowid);

  const visitorA = 'visitor-a-token';
  const visitorB = 'visitor-b-token';
  for (const token of [visitorA, visitorB]) {
    db.prepare(
      `INSERT INTO customers (visitor_token_hash, nickname, status, created_at, updated_at)
       VALUES (?, ?, 'active', ?, ?)`,
    ).run(hashVisitorToken(token), token, now, now);
  }

  const tableA = 'qr-token-a';
  const tableB = 'qr-token-b';
  const tableARowId = Number(db.prepare(
    `INSERT INTO tables (table_no, qr_token, status, created_at, updated_at) VALUES ('A01', ?, 'active', ?, ?)`,
  ).run(tableA, now, now).lastInsertRowid);
  db.prepare(
    `INSERT INTO tables (table_no, qr_token, status, created_at, updated_at) VALUES ('A02', ?, 'active', ?, ?)`,
  ).run(tableB, now, now);

  const app = createApp({
    db,
    jwtSecret: JWT_SECRET,
    config: {
      corsOrigins: ['http://localhost:5173'],
      h5BaseUrl: 'http://localhost:5173',
      uploadDir: './data/test-uploads',
      maxUploadMb: 2,
      nodeEnv: 'test',
      jwtExpiresIn: '8h',
    },
  });

  const adminCookie = await login(app, 'admin', ADMIN_PASSWORD);
  const staffCookie = await login(app, 'staff', STAFF_PASSWORD);

  f = {
    db, app, adminCookie, staffCookie, visitorA, visitorB, tableA, tableB,
    categoryId, dishA, dishB, soldoutDish, specLarge, tableARowId,
  };
});

afterEach(() => {
  f.db.close();
});

async function login(app: Express, username: string, password: string): Promise<string[]> {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'] as unknown as string[];
}

function createOrder(overrides: Record<string, unknown> = {}, visitor = f.visitorA) {
  return request(f.app)
    .post('/api/v1/orders')
    .set('X-Visitor-Token', visitor)
    .send({
      tableToken: f.tableA,
      items: [{ dishId: f.dishA, quantity: 2 }, { dishId: f.dishB, quantity: 1 }],
      remark: '少辣',
      totalCents: 1, // 客户端伪造金额，后端必须忽略
      ...overrides,
    });
}

function count(table: string): number {
  return (f.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

describe('公开接口与顾客流程', () => {
  it('AC-01 桌台令牌解析成功，无效令牌 404', async () => {
    const ok = await request(f.app).get('/api/v1/tables/resolve').query({ token: f.tableA });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ tableNo: 'A01', status: 'active' });

    const bad = await request(f.app).get('/api/v1/tables/resolve').query({ token: 'invalid' });
    expect(bad.status).toBe(404);
    expect(bad.body.code).toBe('NOT_FOUND');
  });

  it('AC-02 菜单查询支持分类/关键字过滤并标记售罄', async () => {
    const all = await request(f.app).get('/api/v1/dishes');
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBe(3);
    expect(all.body.data.items.some((dish: { status: string }) => dish.status === 'soldout')).toBe(true);

    const byCategory = await request(f.app).get('/api/v1/dishes').query({ categoryId: f.categoryId });
    expect(byCategory.body.data.total).toBe(3);

    const byKeyword = await request(f.app).get('/api/v1/dishes').query({ keyword: '宫保' });
    expect(byKeyword.body.data.total).toBe(1);
    expect(byKeyword.body.data.items[0].name).toBe('宫保鸡丁');

    const categories = await request(f.app).get('/api/v1/categories');
    expect(categories.body.data.items[0].dishCount).toBe(2);
  });

  it('POST /visitors 签发顾客令牌并可用于下单', async () => {
    const issued = await request(f.app).post('/api/v1/visitors');
    expect(issued.status).toBe(201);
    const token = issued.body.data.visitorToken as string;
    expect(token).toMatch(/^vst_/);

    const res = await createOrder({}, token);
    expect(res.status).toBe(201);
  });

  it('菜品详情包含规格与选项', async () => {
    const res = await request(f.app).get(`/api/v1/dishes/${f.dishA}`);
    expect(res.status).toBe(200);
    expect(res.body.data.specs[0].options[1]).toMatchObject({ id: 'large', extraPriceCents: 200 });
  });
});

describe('订单创建、金额与事务', () => {
  it('AC-03 后端重算金额并写入名称/单价快照', async () => {
    const res = await createOrder();
    expect(res.status).toBe(201);
    expect(res.body.data.totalCents).toBe(3800);
    expect(res.body.data.status).toBe('PENDING_PAYMENT');
    expect(res.body.data.paymentStatus).toBe('UNPAID');
    expect(res.body.data.items[0]).toMatchObject({
      dishNameSnapshot: '宫保鸡丁', unitPriceCents: 1500, quantity: 2,
    });
    expect(res.body.data.items[1]).toMatchObject({ unitPriceCents: 800 });
  });

  it('规格加价计入单价与总价', async () => {
    const res = await createOrder({
      items: [{ dishId: f.dishA, quantity: 1, specSelections: [{ specId: f.specLarge, optionId: 'large' }] }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.totalCents).toBe(1700);
    expect(res.body.data.items[0].specSnapshot[0]).toMatchObject({
      specName: '份量', optionLabel: '大份', extraPriceCents: 200,
    });
  });

  it('AC-04 混入不存在的 dishId 时全量回滚', async () => {
    const beforeOrders = count('orders');
    const beforeItems = count('order_items');
    const res = await createOrder({
      items: [{ dishId: f.dishA, quantity: 1 }, { dishId: 999999, quantity: 1 }],
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(count('orders')).toBe(beforeOrders);
    expect(count('order_items')).toBe(beforeItems);
  });

  it('AC-05 售罄菜品与非法数量均返回 400 且不落库', async () => {
    const before = count('orders');
    const soldout = await createOrder({ items: [{ dishId: f.soldoutDish, quantity: 1 }] });
    expect(soldout.status).toBe(400);
    expect(soldout.body.message).toContain('售罄');

    const badQty = await createOrder({ items: [{ dishId: f.dishA, quantity: 0 }] });
    expect(badQty.status).toBe(400);
    expect(count('orders')).toBe(before);
  });

  it('无效桌台令牌不可下单', async () => {
    const res = await createOrder({ tableToken: 'expired-token' });
    expect(res.status).toBe(404);
  });
});

describe('状态机、支付与数据隔离', () => {
  it('AC-06 合法流转成功，跳跃与取消被 409 拒绝且状态不变', async () => {
    const created = await createOrder();
    const orderId = created.body.data.id as number;

    const paid = await request(f.app)
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Cookie', f.adminCookie)
      .send({ status: 'PAID' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe('PAID');

    const toPreparing = await request(f.app)
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Cookie', f.adminCookie)
      .send({ status: 'PREPARING' });
    expect(toPreparing.status).toBe(200);

    const back = await request(f.app)
      .patch(`/api/v1/admin/orders/${orderId}/status`)
      .set('Cookie', f.adminCookie)
      .send({ status: 'PENDING_PAYMENT' });
    expect(back.status).toBe(409);

    const cancel = await request(f.app)
      .post(`/api/v1/admin/orders/${orderId}/cancel`)
      .set('Cookie', f.adminCookie);
    expect(cancel.status).toBe(409);

    const detail = await request(f.app)
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Cookie', f.adminCookie);
    expect(detail.body.data.status).toBe('PREPARING');
  });

  it('AC-08 顾客不能查看他人订单', async () => {
    const created = await createOrder();
    const orderId = created.body.data.id as number;

    const own = await request(f.app)
      .get(`/api/v1/orders/${orderId}`)
      .set('X-Visitor-Token', f.visitorA);
    expect(own.status).toBe(200);

    const other = await request(f.app)
      .get(`/api/v1/orders/${orderId}`)
      .set('X-Visitor-Token', f.visitorB);
    expect(other.status).toBe(403);
    expect(other.body.data).toBeNull();

    const mine = await request(f.app)
      .get('/api/v1/orders/mine')
      .set('X-Visitor-Token', f.visitorB);
    expect(mine.body.data.items).toHaveLength(0);
  });

  it('AC-09 模拟支付推进状态且重复支付 409', async () => {
    const created = await createOrder();
    const orderId = created.body.data.id as number;

    const paid = await request(f.app)
      .post(`/api/v1/orders/${orderId}/pay`)
      .set('X-Visitor-Token', f.visitorA);
    expect(paid.status).toBe(200);
    expect(paid.body.data.paymentStatus).toBe('PAID');
    expect(paid.body.data.status).toBe('PAID');
    expect(count('payments')).toBe(1);

    const again = await request(f.app)
      .post(`/api/v1/orders/${orderId}/pay`)
      .set('X-Visitor-Token', f.visitorA);
    expect(again.status).toBe(409);
    expect(count('payments')).toBe(1);
  });
});

describe('后台鉴权与管理', () => {
  it('AC-07 无 token 401，staff 访问菜品管理 403', async () => {
    const anonymous = await request(f.app).get('/api/v1/admin/categories');
    expect(anonymous.status).toBe(401);

    const staff = await request(f.app)
      .get('/api/v1/admin/dishes')
      .set('Cookie', f.staffCookie);
    expect(staff.status).toBe(403);

    const staffOrders = await request(f.app)
      .get('/api/v1/admin/orders')
      .set('Cookie', f.staffCookie);
    expect(staffOrders.status).toBe(200);
  });

  it('AC-10 重生成桌台令牌后旧令牌立即失效', async () => {
    const regenerated = await request(f.app)
      .post(`/api/v1/admin/tables/${f.tableARowId}/qr`)
      .set('Cookie', f.adminCookie);
    expect(regenerated.status).toBe(200);
    const newToken = regenerated.body.data.qrToken as string;
    expect(newToken).not.toBe(f.tableA);

    const old = await request(f.app).get('/api/v1/tables/resolve').query({ token: f.tableA });
    expect(old.status).toBe(404);
    const fresh = await request(f.app).get('/api/v1/tables/resolve').query({ token: newToken });
    expect(fresh.status).toBe(200);
  });

  it('AC-11 后台订单按状态筛选与分页', async () => {
    const ids: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const created = await createOrder();
      ids.push(created.body.data.id as number);
    }
    for (const id of ids.slice(0, 2)) {
      await request(f.app)
        .patch(`/api/v1/admin/orders/${id}/status`)
        .set('Cookie', f.adminCookie)
        .send({ status: 'PAID' });
    }

    const page1 = await request(f.app)
      .get('/api/v1/admin/orders')
      .query({ status: 'PAID', page: 1, pageSize: 1 })
      .set('Cookie', f.adminCookie);
    expect(page1.status).toBe(200);
    expect(page1.body.data.total).toBe(2);
    expect(page1.body.data.items).toHaveLength(1);
    expect(page1.body.data.page).toBe(1);
    expect(page1.body.data.pageSize).toBe(1);
  });

  it('AC-12 经营概览与订单聚合一致', async () => {
    const created = await createOrder();
    const orderId = created.body.data.id as number;
    await request(f.app)
      .post(`/api/v1/orders/${orderId}/pay`)
      .set('X-Visitor-Token', f.visitorA);

    const overview = await request(f.app)
      .get('/api/v1/admin/stats/overview')
      .set('Cookie', f.adminCookie);
    expect(overview.status).toBe(200);
    expect(overview.body.data.todayOrderCount).toBe(1);
    expect(overview.body.data.todayRevenueCents).toBe(3800);
    expect(overview.body.data.statusCounts.PAID).toBe(1);
  });

  it('AC-13 参数错误/未授权/资源不存在均返回统一包络', async () => {
    const badParam = await request(f.app).get('/api/v1/tables/resolve');
    expect(badParam.status).toBe(400);
    expect(badParam.body.code).toBe('INVALID_PARAM');
    expect(badParam.body.message).toBe('参数错误');
    expect(badParam.body.requestId).toBeTruthy();
    expect(badParam.headers['x-request-id']).toBe(badParam.body.requestId);

    const unauthorized = await request(f.app).get('/api/v1/admin/users');
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.body.code).toBe('UNAUTHORIZED');
    expect(unauthorized.body.requestId).toBeTruthy();

    const missing = await request(f.app).get('/api/v1/dishes/999999');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    expect(missing.body.data).toBeNull();
  });

  it('AC-15 数据库仅存密码哈希与顾客令牌哈希', () => {
    const admin = f.db.prepare('SELECT password_hash FROM admin_users WHERE username = ?').get('admin') as { password_hash: string };
    expect(admin.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(admin.password_hash).not.toContain(ADMIN_PASSWORD);

    const customer = f.db.prepare('SELECT visitor_token_hash FROM customers LIMIT 1').get() as { visitor_token_hash: string };
    expect(customer.visitor_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(customer.visitor_token_hash).not.toContain(f.visitorA);
  });

  it('后台分类/菜品/桌台/账号 CRUD 可用', async () => {
    const category = await request(f.app)
      .post('/api/v1/admin/categories')
      .set('Cookie', f.adminCookie)
      .send({ name: '汤类', sortOrder: 5 });
    expect(category.status).toBe(201);
    const categoryId = category.body.data.id as number;

    const dish = await request(f.app)
      .post('/api/v1/admin/dishes')
      .set('Cookie', f.adminCookie)
      .send({ categoryId, name: '番茄蛋汤', priceYuan: '12.50', status: 'on' });
    expect(dish.status).toBe(201);
    expect(dish.body.data.price_cents).toBe(1250);

    const table = await request(f.app)
      .post('/api/v1/admin/tables')
      .set('Cookie', f.adminCookie)
      .send({ tableNo: 'B01' });
    expect(table.status).toBe(201);
    expect(table.body.data.qrUrl).toContain('tableToken=');

    const account = await request(f.app)
      .post('/api/v1/admin/accounts')
      .set('Cookie', f.adminCookie)
      .send({ username: 'staff2', password: 'StaffPass456', realName: '新店员', role: 'staff' });
    expect(account.status).toBe(201);
    expect(JSON.stringify(account.body)).not.toContain('password_hash');

    const deleted = await request(f.app)
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set('Cookie', f.adminCookie);
    expect(deleted.status).toBe(409); // 该分类下已有菜品，禁止删除
  });

  it('上传接口拒绝非图片文件', async () => {
    const res = await request(f.app)
      .post('/api/v1/admin/uploads')
      .set('Cookie', f.adminCookie)
      .attach('file', Buffer.from('not an image'), 'note.txt');
    expect(res.status).toBe(400);
  });
});
