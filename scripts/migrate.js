import { createPool } from '../server/database/connection.js';
import { migrate, migrationStatus } from '../server/database/migrate.js';

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const pool = createPool(connectionString);

try {
  if (process.argv.includes('--status')) {
    const status = await migrationStatus(pool);
    for (const migration of status) {
      console.log(`${migration.status.padEnd(8)} ${migration.version} ${migration.name}`);
    }
  } else {
    const applied = await migrate(pool);
    console.log(`Migrações verificadas: ${applied.length}.`);
  }
} catch (error) {
  console.error(`Falha nas migrações: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
