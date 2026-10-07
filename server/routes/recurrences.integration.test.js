// @vitest-environment node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { generateRecurrenceOccurrences, listCompetenceMonths, recurrenceHorizonMonth } from '../services/recurrences.js';
import { createSession } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startApiProcess(databaseUrl, port) {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`A API encerrou durante a inicialização: ${output.join('')}`);
    try {
      await request(`http://127.0.0.1:${port}`).get('/api/health').timeout({ deadline: 500 }).expect(200);
      return { child, output };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  child.kill('SIGTERM');
  throw new Error(`A API não ficou pronta: ${output.join('')}`);
}

async function stopApiProcess(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('A API não encerrou após SIGTERM.')), 5000);
    once(child, 'exit').then(() => {
      clearTimeout(timeout);
      resolve();
    }, reject);
  });
}

describe.skipIf(!testDatabaseUrl)('monthly recurrence routes with PostgreSQL', () => {
  let pool;
  let app;

  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!/_test$/.test(databaseName)) throw new Error('TEST_DATABASE_URL deve apontar para um banco descartável com sufixo _test.');
    pool = createPool(testDatabaseUrl);
    await migrate(pool);
    await pool.query('TRUNCATE users CASCADE');
    app = createApp({ pool, loginLimit: 100 });
  });

  afterAll(async () => {
    if (pool) await pool.query('TRUNCATE users CASCADE');
    await pool?.end();
  });

  function sameOrigin(agent, method, path, csrfToken) {
    let call = agent[method](path).set('Host', 'conta-clara.test').set('Origin', origin);
    if (csrfToken) call = call.set('X-CSRF-Token', csrfToken);
    return call;
  }

  function cookieValue(response, name) {
    return response.headers['set-cookie']?.find((value) => value.startsWith(`${name}=`))?.split(';', 1)[0].slice(name.length + 1);
  }

  function sessionRequest(method, path, sessionToken, csrfToken, body) {
    let call = request(app)[method](path)
      .set('Host', 'conta-clara.test')
      .set('Origin', origin)
      .set('Cookie', `cc_session=${sessionToken}; cc_csrf=${csrfToken}`);
    if (csrfToken) call = call.set('X-CSRF-Token', csrfToken);
    if (body !== undefined) call = call.send(body);
    return call;
  }

  async function createOtherSpace() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query(
        "INSERT INTO users (email, display_name, password_hash) VALUES ('recurrences-other@example.test', 'Outra administradora', 'integration-test-only') RETURNING id",
      );
      const space = await client.query(
        "INSERT INTO finance_spaces (name, created_by_user_id) VALUES ('Outro espaço de recorrências', $1) RETURNING id",
        [user.rows[0].id],
      );
      await client.query("INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, 'admin')", [space.rows[0].id, user.rows[0].id]);
      const sessionToken = await createSession(client, { user_id: user.rows[0].id, space_id: space.rows[0].id });
      await client.query('COMMIT');
      return { spaceId: space.rows[0].id, sessionToken };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  it('generates dated occurrences once, preserves edits, catches up after downtime, and stops after archive', async () => {
    const browser = request.agent(app);
    const state = await sameOrigin(browser, 'get', '/api/auth/state').expect(200);
    const setup = await sameOrigin(browser, 'post', '/api/auth/setup', state.body.csrfToken)
      .send({ displayName: 'Admin recorrências', email: 'admin-recurrences@example.test', password: 'senha-admin-recurrences-ficticia-123' }).expect(201);
    const admin = setup.body.user;
    const session = cookieValue(setup, 'cc_session');
    const category = await sessionRequest('post', '/api/catalog/categories', session, state.body.csrfToken, {
      name: 'Moradia', kind: 'expense', expenseClass: 'fixed',
    }).expect(201);
    const paymentMethod = await sessionRequest('post', '/api/catalog/payment-methods', session, state.body.csrfToken, { name: 'Pix' }).expect(201);
    const otherSpace = await createOtherSpace();
    const otherCategory = await pool.query("INSERT INTO categories (space_id, name, kind) VALUES ($1, 'Categoria externa', 'expense') RETURNING id", [otherSpace.spaceId]);

    await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken, {
      kind: 'expense', description: 'Conta inválida', startCompetenceOn: '2024-01-01', endCompetenceOn: '2023-12-01',
      dueDay: 31, plannedCents: 1000, categoryId: category.body.category.id,
    }).expect(400);
    await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken, {
      kind: 'expense', description: 'Dia inválido', startCompetenceOn: '2024-01-01', dueDay: 32,
      plannedCents: 1000, categoryId: category.body.category.id,
    }).expect(400);
    await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken, {
      kind: 'expense', description: 'Categoria externa', startCompetenceOn: '2024-01-01',
      plannedCents: 1000, categoryId: otherCategory.rows[0].id,
    }).expect(400);

    const finite = await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken, {
      kind: 'expense', description: 'Aluguel', categoryId: category.body.category.id,
      paymentMethodId: paymentMethod.body.paymentMethod.id, startCompetenceOn: '2024-01-01',
      endCompetenceOn: '2024-03-01', dueDay: 31, plannedCents: 180000,
    }).expect(201);
    const ruleId = finite.body.rule.id;
    expect(finite.body.generatedCount).toBe(3);
    expect(finite.body.rule.occurrence_count).toBe(3);
    await sessionRequest('get', `/api/recurrences/${ruleId}`, otherSpace.sessionToken, state.body.csrfToken).expect(404);
    await sessionRequest('get', '/api/recurrences', otherSpace.sessionToken, state.body.csrfToken).expect(200)
      .expect(({ body }) => expect(body.rules).toEqual([]));

    const february = await sessionRequest('get', '/api/entries?month=2024-02', session, state.body.csrfToken).expect(200);
    expect(february.body.entries).toHaveLength(1);
    expect(february.body.entries[0]).toMatchObject({ description: 'Aluguel', competence_on: '2024-02-01', due_on: '2024-02-29', recurrence_rule_id: ruleId, recurrence_overridden: false });
    const rows = await pool.query('SELECT competence_on::text, due_on::text FROM financial_entries WHERE recurrence_rule_id = $1 ORDER BY competence_on', [ruleId]);
    expect(rows.rows).toEqual([
      { competence_on: '2024-01-01', due_on: '2024-01-31' },
      { competence_on: '2024-02-01', due_on: '2024-02-29' },
      { competence_on: '2024-03-01', due_on: '2024-03-31' },
    ]);
    const createdAudit = await pool.query(`
      SELECT a.action, a.actor_user_id, a.entry_description, e.competence_on::text AS competence_on
      FROM financial_entry_audit a JOIN financial_entries e ON e.id = a.entry_id
      WHERE e.recurrence_rule_id = $1 AND a.action = 'created'
      ORDER BY e.competence_on
    `, [ruleId]);
    expect(createdAudit.rows).toEqual([
      { action: 'created', actor_user_id: admin.id, entry_description: 'Aluguel', competence_on: '2024-01-01' },
      { action: 'created', actor_user_id: admin.id, entry_description: 'Aluguel', competence_on: '2024-02-01' },
      { action: 'created', actor_user_id: admin.id, entry_description: 'Aluguel', competence_on: '2024-03-01' },
    ]);
    await expect(pool.query(`
      INSERT INTO financial_entries (space_id, created_by_user_id, updated_by_user_id, kind, description, competence_on, planned_cents, recurrence_rule_id)
      SELECT space_id, created_by_user_id, updated_by_user_id, kind, description, competence_on, planned_cents, recurrence_rule_id
      FROM financial_entries WHERE recurrence_rule_id = $1 AND competence_on = '2024-02-01'
    `, [ruleId])).rejects.toMatchObject({ code: '23505' });

    const editedOccurrence = await sessionRequest('put', `/api/entries/${february.body.entries[0].id}`, session, state.body.csrfToken, {
      kind: 'expense', description: 'Aluguel ajustado', categoryId: category.body.category.id,
      competenceOn: '2024-02-01', dueOn: '2024-02-15', plannedCents: 175000,
      paymentMethodId: paymentMethod.body.paymentMethod.id, notes: null,
    }).expect(200);
    expect(editedOccurrence.body.entry).toMatchObject({ description: 'Aluguel ajustado', due_on: '2024-02-15', planned_cents: '175000', recurrence_overridden: true, updated_by_user_id: admin.id });

    const changedRule = await sessionRequest('put', `/api/recurrences/${ruleId}`, session, state.body.csrfToken, {
      kind: 'expense', description: 'Aluguel atualizado', categoryId: category.body.category.id,
      paymentMethodId: paymentMethod.body.paymentMethod.id, startCompetenceOn: '2024-01-01',
      endCompetenceOn: '2024-03-01', dueDay: 31, plannedCents: 190000,
    }).expect(200);
    expect(changedRule.body.generatedCount).toBe(0);
    const afterRuleChange = await pool.query(`
      SELECT description, planned_cents, recurrence_overridden FROM financial_entries
      WHERE recurrence_rule_id = $1 AND competence_on = '2024-02-01'
    `, [ruleId]);
    expect(afterRuleChange.rows).toEqual([{ description: 'Aluguel ajustado', planned_cents: '175000', recurrence_overridden: true }]);

    const dbMonthResult = await pool.query("SELECT to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS month");
    const currentMonth = dbMonthResult.rows[0].month;
    const horizonThroughMonth = recurrenceHorizonMonth(currentMonth);
    const horizonMonths = listCompetenceMonths(currentMonth, null, horizonThroughMonth);
    const forecast = await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken, {
      kind: 'expense', description: 'Internet prevista', categoryId: category.body.category.id,
      startCompetenceOn: currentMonth, endCompetenceOn: null, dueDay: 31, plannedCents: 9990,
    }).expect(201);
    expect(horizonMonths).toHaveLength(13);
    expect(forecast.body.generatedCount).toBe(13);
    expect(forecast.body.rule.occurrence_count).toBe(13);
    const forecastRows = await pool.query(`
      SELECT competence_on::text FROM financial_entries
      WHERE recurrence_rule_id = $1 ORDER BY competence_on
    `, [forecast.body.rule.id]);
    expect(forecastRows.rows.map(({ competence_on }) => competence_on)).toEqual(horizonMonths);

    const lastHorizonRule = await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken, {
      kind: 'expense', description: 'Último mês projetado', categoryId: category.body.category.id,
      startCompetenceOn: horizonThroughMonth, endCompetenceOn: horizonThroughMonth, plannedCents: 1000,
    }).expect(201);
    expect(lastHorizonRule.body.generatedCount).toBe(1);
    const beyondHorizonMonth = recurrenceHorizonMonth(currentMonth, 13);
    const beyondHorizonRule = await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken, {
      kind: 'expense', description: 'Fora do horizonte', categoryId: category.body.category.id,
      startCompetenceOn: beyondHorizonMonth, endCompetenceOn: beyondHorizonMonth, plannedCents: 1000,
    }).expect(201);
    expect(beyondHorizonRule.body.generatedCount).toBe(0);
    const beyondHorizonRows = await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE recurrence_rule_id = $1', [beyondHorizonRule.body.rule.id]);
    expect(beyondHorizonRows.rows[0].count).toBe(0);

    const catchUpThroughMonth = recurrenceHorizonMonth(currentMonth, 15);
    const catchUp = await sessionRequest('post', '/api/recurrences', session, state.body.csrfToken, {
      kind: 'expense', description: 'Internet futura', categoryId: category.body.category.id,
      startCompetenceOn: beyondHorizonMonth, endCompetenceOn: catchUpThroughMonth, dueDay: 31, plannedCents: 9990,
    }).expect(201);
    expect(catchUp.body.generatedCount).toBe(0);
    const updatedCatchUp = await sessionRequest('put', `/api/recurrences/${catchUp.body.rule.id}`, session, state.body.csrfToken, {
      kind: 'expense', description: 'Internet futura reajustada', categoryId: category.body.category.id,
      startCompetenceOn: beyondHorizonMonth, endCompetenceOn: catchUpThroughMonth, dueDay: 31, plannedCents: 10990,
    }).expect(200);
    expect(updatedCatchUp.body.generatedCount).toBe(0);
    await expect(generateRecurrenceOccurrences(pool, { spaceId: admin.spaceId, ruleId: catchUp.body.rule.id, throughMonth: catchUpThroughMonth })).resolves.toBe(3);
    await expect(generateRecurrenceOccurrences(pool, { spaceId: admin.spaceId, ruleId: catchUp.body.rule.id, throughMonth: catchUpThroughMonth })).resolves.toBe(0);
    const futureMonths = listCompetenceMonths(beyondHorizonMonth, catchUpThroughMonth, catchUpThroughMonth);
    const catchUpRows = await pool.query(`
      SELECT competence_on::text, description, planned_cents
      FROM financial_entries WHERE recurrence_rule_id = $1 ORDER BY competence_on
    `, [catchUp.body.rule.id]);
    expect(catchUpRows.rows).toEqual(futureMonths.map((competence_on) => ({ competence_on, description: 'Internet futura reajustada', planned_cents: '10990' })));

    const firstFutureEntries = await sessionRequest('get', `/api/entries?month=${futureMonths[0].slice(0, 7)}`, session, state.body.csrfToken).expect(200);
    expect(firstFutureEntries.body.entries).toHaveLength(1);
    await sessionRequest('delete', `/api/entries/${firstFutureEntries.body.entries[0].id}`, session, state.body.csrfToken).expect(204);
    await expect(generateRecurrenceOccurrences(pool, { spaceId: admin.spaceId, ruleId: catchUp.body.rule.id, throughMonth: catchUpThroughMonth })).resolves.toBe(0);
    await sessionRequest('get', `/api/entries?month=${futureMonths[0].slice(0, 7)}`, session, state.body.csrfToken).expect(200)
      .expect(({ body }) => expect(body.entries).toEqual([]));

    await sessionRequest('post', `/api/recurrences/${catchUp.body.rule.id}/archive`, session, state.body.csrfToken).expect(204);
    const laterMonth = recurrenceHorizonMonth(currentMonth, 16);
    await expect(generateRecurrenceOccurrences(pool, { spaceId: admin.spaceId, ruleId: catchUp.body.rule.id, throughMonth: laterMonth })).resolves.toBe(0);
    const preserved = await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE recurrence_rule_id = $1', [catchUp.body.rule.id]);
    expect(preserved.rows[0].count).toBe(3);
    await sessionRequest('post', `/api/recurrences/${ruleId}/archive`, session, state.body.csrfToken).expect(204);
    await expect(generateRecurrenceOccurrences(pool, { spaceId: admin.spaceId, ruleId, throughMonth: '2025-02-01' })).resolves.toBe(0);
    const finitePreserved = await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE recurrence_rule_id = $1', [ruleId]);
    expect(finitePreserved.rows[0].count).toBe(3);

    const firstMissingMonth = new Date(Date.UTC(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)) - 1 - 3, 1)).toISOString().slice(0, 10);
    const restartRule = await pool.query(`
      INSERT INTO recurrence_rules (
        space_id, created_by_user_id, updated_by_user_id, kind, description,
        category_id, start_competence_on, due_day, planned_cents
      ) VALUES ($1, $2, $2, 'expense', 'Retomada após parada', $3, $4, 31, 5000)
      RETURNING id
    `, [admin.spaceId, admin.id, category.body.category.id, firstMissingMonth]);
    const restartRuleId = restartRule.rows[0].id;
    let child;
    try {
      for (let restart = 0; restart < 2; restart += 1) {
        const port = await findAvailablePort();
        const process = await startApiProcess(testDatabaseUrl, port);
        child = process.child;
        const startedOccurrences = await pool.query(
          'SELECT count(*)::integer AS count FROM financial_entries WHERE recurrence_rule_id = $1',
          [restartRuleId],
        );
        expect(startedOccurrences.rows[0].count).toBe(16);
        await stopApiProcess(child);
        child = null;
      }
    } finally {
      if (child) await stopApiProcess(child);
    }
  });
});
