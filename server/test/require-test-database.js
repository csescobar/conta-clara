// Executado uma vez antes de qualquer teste Postgres: sem uma base descartável, a execução falha
// em vez de ignorar os testes silenciosamente.
export default function requireTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Defina TEST_DATABASE_URL em .env.test para executar os testes Postgres (veja .env.test.example).');
  let databaseName;
  try {
    databaseName = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    throw new Error('TEST_DATABASE_URL precisa ser uma URL PostgreSQL válida.');
  }
  if (!databaseName.endsWith('_test')) {
    throw new Error('Execução bloqueada: TEST_DATABASE_URL deve apontar para uma base descartável com sufixo _test.');
  }
}
