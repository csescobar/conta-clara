import { defineConfig } from 'vitest/config';

// Testes que usam Postgres descartável (TEST_DATABASE_URL em .env.test). Todos limpam as mesmas
// tabelas, por isso os arquivos rodam em sequência. Novos `*.integration.test.js` entram sozinhos.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.integration.test.js'],
    globalSetup: ['./server/test/require-test-database.js'],
    fileParallelism: false,
  },
});
