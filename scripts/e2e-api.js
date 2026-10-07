import { createPool } from '../server/database/connection.js';
import { migrate } from '../server/database/migrate.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('Defina TEST_DATABASE_URL em .env.test para executar os testes de navegador.');
}

let databaseName;
try {
  databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
} catch {
  throw new Error('TEST_DATABASE_URL precisa apontar para uma URL PostgreSQL válida.');
}
if (!databaseName.endsWith('_test')) {
  throw new Error('Execução bloqueada: TEST_DATABASE_URL precisa usar uma base descartável terminada em _test.');
}

const testPool = createPool(testDatabaseUrl);
try {
  await migrate(testPool);
  await testPool.query('TRUNCATE TABLE users CASCADE');
} finally {
  await testPool.end();
}

// Never fall back to DATABASE_URL from the caller or the development .env.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.HOST = '127.0.0.1';
process.env.PORT = '3001';
process.env.COOKIE_SECURE = 'false';

await import('../server/index.js');
