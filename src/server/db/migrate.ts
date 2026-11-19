import { getConfig } from '../config.js';
import { createDb, migrate } from './client.js';

const db = createDb(getConfig().databasePath);
try {
  migrate(db);
  console.log(`数据库迁移完成：${getConfig().databasePath}`);
} finally {
  db.close();
}
