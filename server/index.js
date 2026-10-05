import { createPool } from './database/connection.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';
const pool = createPool();
const app = createApp({ pool });
const server = app.listen(port, host, () => {
  console.log(`Conta Clara API escutando em ${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
