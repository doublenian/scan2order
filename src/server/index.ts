import { createApp } from './app.js';
import { getConfig, getJwtSecret } from './config.js';
import { createDb, migrate } from './db/client.js';

const config = getConfig();
const jwtSecret = getJwtSecret();
const db = createDb(config.databasePath);
migrate(db);

const app = createApp({ db, jwtSecret, config });
const server = app.listen(config.port, () => {
  console.log(JSON.stringify({
    time: new Date().toISOString(),
    level: 'info',
    message: 'scan2order API 已启动',
    port: config.port,
    env: config.nodeEnv,
  }));
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
