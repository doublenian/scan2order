import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getConfig, getSeedAdmin } from '../config.js';
import { createDb, migrate, nowIso } from './client.js';

const config = getConfig();
const { username, password } = getSeedAdmin();
const db = createDb(config.databasePath);

try {
  migrate(db);
  const now = nowIso();
  const hashed = bcrypt.hashSync(password, 10);

  const adminCount = (db.prepare('SELECT COUNT(*) AS count FROM admin_users').get() as { count: number }).count;
  if (adminCount === 0) {
    db.prepare(
      `INSERT INTO admin_users (username, password_hash, real_name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
    ).run(username, hashed, '系统管理员', now, now);
    console.log(`已创建初始管理员：${username}`);
  } else {
    console.log('初始管理员已存在，跳过创建');
  }

  const dishCount = (db.prepare('SELECT COUNT(*) AS count FROM dishes').get() as { count: number }).count;
  if (dishCount === 0) {
    seedDemo(db, now, config.h5BaseUrl);
    console.log('已写入演示分类 / 菜品 / 桌台');
  } else {
    console.log('演示数据已存在，跳过写入');
  }
} finally {
  db.close();
}

function seedDemo(db: ReturnType<typeof createDb>, now: string, h5BaseUrl: string): void {
  const insertCategory = db.prepare(
    `INSERT INTO categories (name, sort_order, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`,
  );
  const catIds = [
    insertCategory.run('热菜', 1, now, now).lastInsertRowid as number,
    insertCategory.run('凉菜', 2, now, now).lastInsertRowid as number,
    insertCategory.run('饮品', 3, now, now).lastInsertRowid as number,
  ];

  const insertDish = db.prepare(
    `INSERT INTO dishes (category_id, name, description, image_url, price_cents, tags_json, status, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, '', ?, ?, 'on', ?, ?, ?)`,
  );
  const dishes = [
    [catIds[0], '宫保鸡丁', '经典川味，微辣', 1500, '["辣","新品"]', 1],
    [catIds[0], '红烧肉', '慢炖五花肉', 2800, '[]', 2],
    [catIds[0], '麻婆豆腐', '麻辣鲜香', 1200, '["辣"]', 3],
    [catIds[1], '拍黄瓜', '清爽开胃', 800, '[]', 1],
    [catIds[2], '柠檬水', '冰镇现调', 600, '[]', 1],
  ] as const;
  const dishIds = dishes.map((row) => Number(insertDish.run(...row, now, now).lastInsertRowid));

  const insertSpec = db.prepare(
    `INSERT INTO dish_specs (dish_id, name, options_json, extra_price_cents, required, sort_order, status, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, 1, 'active', ?, ?)`,
  );
  insertSpec.run(
    dishIds[0],
    '份量',
    JSON.stringify([
      { id: 'small', label: '小份', extraPriceCents: 0 },
      { id: 'large', label: '大份', extraPriceCents: 200 },
    ]),
    now,
    now,
  );

  const insertTable = db.prepare(
    `INSERT INTO tables (table_no, qr_token, status, created_at, updated_at) VALUES (?, ?, 'active', ?, ?)`,
  );
  console.log('桌台二维码链接：');
  for (let i = 1; i <= 5; i += 1) {
    const token = randomBytes(16).toString('hex');
    insertTable.run(`A${String(i).padStart(2, '0')}`, token, now, now);
    console.log(`  A${String(i).padStart(2, '0')}: ${h5BaseUrl}/?tableToken=${token}`);
  }
}
