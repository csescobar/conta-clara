// @vitest-environment node
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createPool } from '../database/connection.js';
import { migrate } from '../database/migrate.js';
import { createSession } from './auth.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const origin = 'http://conta-clara.test';

describe.skipIf(!testDatabaseUrl)('offline synchronization routes with PostgreSQL', () => {
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
    return response.headers['set-cookie']
      ?.find((value) => value.startsWith(`${name}=`))
      ?.split(';', 1)[0]
      .slice(name.length + 1);
  }

  function sessionRequest(method, path, sessionToken, csrfToken, body) {
    let call = request(app)
      [method](path)
      .set('Host', 'conta-clara.test')
      .set('Origin', origin)
      .set('Cookie', `cc_session=${sessionToken}; cc_csrf=${csrfToken}`);
    if (csrfToken) call = call.set('X-CSRF-Token', csrfToken);
    if (body !== undefined) call = call.send(body);
    return call;
  }

  async function createSpaceUser({ email, name, role = 'admin', spaceId } = {}) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const user = await client.query('INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id', [
        email,
        name,
        'integration-test-only',
      ]);
      let activeSpaceId = spaceId;
      if (!activeSpaceId) {
        const space = await client.query('INSERT INTO finance_spaces (name, created_by_user_id) VALUES ($1, $2) RETURNING id', [
          `Espaço ${name}`,
          user.rows[0].id,
        ]);
        activeSpaceId = space.rows[0].id;
      }
      await client.query('INSERT INTO space_memberships (space_id, user_id, role) VALUES ($1, $2, $3)', [
        activeSpaceId,
        user.rows[0].id,
        role,
      ]);
      const sessionToken = await createSession(client, { user_id: user.rows[0].id, space_id: activeSpaceId });
      await client.query('COMMIT');
      return { id: user.rows[0].id, spaceId: activeSpaceId, sessionToken };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function createMember(admin, csrfToken, label) {
    const adminBrowser = request.agent(app);
    const state = await sameOrigin(adminBrowser, 'get', '/api/auth/state').expect(200);
    const emailLocal = label
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    const invite = await sessionRequest('post', '/api/members/invitations', admin.sessionToken, csrfToken, {
      email: `${emailLocal}@example.test`,
    }).expect(201);
    const memberBrowser = request.agent(app);
    const memberState = await sameOrigin(memberBrowser, 'get', '/api/auth/state').expect(200);
    const activation = await sameOrigin(memberBrowser, 'post', '/api/auth/accept-invite', memberState.body.csrfToken)
      .send({ token: invite.body.activationPath.split('/').at(-1), displayName: label, password: 'senha-membro-ficticia-123' })
      .expect(201);
    return {
      user: activation.body.user,
      sessionToken: cookieValue(activation, 'cc_session'),
      csrfToken: memberState.body.csrfToken,
      state,
    };
  }

  async function createEntry(sessionToken, csrfToken, spaceId, description = 'Despesa de teste') {
    const category = await sessionRequest('post', '/api/catalog/categories', sessionToken, csrfToken, {
      name: `Categoria ${randomUUID().slice(0, 8)}`,
      kind: 'expense',
      expenseClass: 'fixed',
    }).expect(201);
    const entry = await sessionRequest('post', '/api/entries', sessionToken, csrfToken, {
      kind: 'expense',
      description,
      categoryId: category.body.category.id,
      competenceOn: '2026-10-01',
      dueOn: '2026-10-10',
      plannedCents: 12500,
    }).expect(201);
    expect(entry.body.entry.version).toBe(1);
    return { ...entry.body.entry, spaceId };
  }

  function offlineOperation({ kind, entryId, baseVersion, operationId = randomUUID(), payload = null }) {
    return { operationId, entryId, kind, baseVersion: kind === 'create' ? null : baseVersion, payload };
  }

  it('replays concurrent and delayed create requests exactly once after a lost response', async () => {
    const admin = await createSpaceUser({ email: 'sync-create@example.test', name: 'Admin sincronização' });
    const csrfBrowser = request.agent(app);
    const csrfToken = (await sameOrigin(csrfBrowser, 'get', '/api/auth/state').expect(200)).body.csrfToken;
    const operation = offlineOperation({
      kind: 'create',
      entryId: randomUUID(),
      payload: {
        kind: 'expense',
        description: 'Compra offline fictícia',
        categoryId: null,
        competenceOn: '2026-10-01',
        dueOn: '2026-10-10',
        plannedCents: 4550,
        paymentMethodId: null,
        notes: null,
        created_by_user_id: 'ator-forjado',
      },
    });

    const simultaneous = await Promise.all([
      sessionRequest('post', '/api/sync/operations', admin.sessionToken, csrfToken, operation),
      sessionRequest('post', '/api/sync/operations', admin.sessionToken, csrfToken, operation),
    ]);
    expect(simultaneous.map(({ status }) => status)).toEqual([200, 200]);
    expect(simultaneous[0].body).toEqual(simultaneous[1].body);
    expect(simultaneous[0].body.entry).toMatchObject({
      id: operation.entryId,
      version: 1,
      created_by_user_id: admin.id,
      updated_by_user_id: admin.id,
    });

    const retried = await sessionRequest('post', '/api/sync/operations', admin.sessionToken, csrfToken, operation).expect(200);
    expect(retried.body).toEqual(simultaneous[0].body);
    const stored = await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE id = $1', [operation.entryId]);
    const audited = await pool.query(
      "SELECT count(*)::integer AS count FROM financial_entry_audit WHERE entry_id = $1 AND action = 'created'",
      [operation.entryId],
    );
    expect(stored.rows[0].count).toBe(1);
    expect(audited.rows[0].count).toBe(1);

    const reused = await sessionRequest('post', '/api/sync/operations', admin.sessionToken, csrfToken, {
      ...operation,
      payload: { ...operation.payload, description: 'Dados diferentes' },
    }).expect(409);
    expect(reused.body).toMatchObject({
      status: 'conflict',
      reason: 'idempotency_key_reused',
      serverEntry: { id: operation.entryId, version: 1, description: 'Compra offline fictícia' },
    });
    const editedAfterLostResponse = await sessionRequest('post', '/api/sync/operations', admin.sessionToken, csrfToken, {
      ...operation,
      kind: 'update',
      baseVersion: reused.body.serverEntry.version,
      operationId: randomUUID(),
      payload: { ...operation.payload, description: 'Edição após resposta perdida' },
    }).expect(200);
    expect(editedAfterLostResponse.body.entry).toMatchObject({
      id: operation.entryId,
      version: 2,
      description: 'Edição após resposta perdida',
    });
    const updatedStored = await pool.query(
      'SELECT count(*)::integer AS count, min(description) AS description FROM financial_entries WHERE id = $1',
      [operation.entryId],
    );
    expect(updatedStored.rows[0]).toMatchObject({ count: 1, description: 'Edição após resposta perdida' });
  });

  it('synchronizes shared card changes idempotently and returns explicit version conflicts', async () => {
    const admin = await createSpaceUser({ email: 'sync-card-admin@example.test', name: 'Admin cartões offline' });
    const adminCsrf = (await sameOrigin(request.agent(app), 'get', '/api/auth/state').expect(200)).body.csrfToken;
    const member = await createMember(admin, adminCsrf, 'Membro cartões offline');
    const cardId = randomUUID();
    const createOperation = {
      entity: 'card',
      cardId,
      operationId: randomUUID(),
      kind: 'create',
      baseVersion: null,
      payload: { name: 'Cartão offline fictício', holderUserId: member.user.id, closingDay: 31, dueDay: 5, archived: false, cvv: '123' },
    };

    const createdResponses = await Promise.all([
      sessionRequest('post', '/api/sync/operations', admin.sessionToken, adminCsrf, createOperation),
      sessionRequest('post', '/api/sync/operations', admin.sessionToken, adminCsrf, createOperation),
    ]);
    expect(createdResponses.map(({ status }) => status)).toEqual([200, 200]);
    expect(createdResponses[0].body).toEqual(createdResponses[1].body);
    expect(createdResponses[0].body).toMatchObject({
      status: 'applied',
      card: { id: cardId, name: 'Cartão offline fictício', holder_user_id: member.user.id, version: 1 },
    });
    expect(createdResponses[0].body.card).not.toHaveProperty('cvv');
    expect(
      await sessionRequest('post', '/api/sync/operations', admin.sessionToken, adminCsrf, createOperation).then(({ body }) => body),
    ).toEqual(createdResponses[0].body);

    await sessionRequest('put', `/api/cards/${cardId}`, member.sessionToken, member.csrfToken, {
      name: 'Cartão alterado no outro aparelho',
      holderUserId: member.user.id,
      closingDay: 30,
      dueDay: 6,
      baseVersion: 1,
    }).expect(200);
    const staleOperation = {
      entity: 'card',
      cardId,
      operationId: randomUUID(),
      kind: 'update',
      baseVersion: 1,
      payload: { name: 'Minha alteração offline', holderUserId: member.user.id, closingDay: 28, dueDay: 8, archived: false },
    };
    const conflict = await sessionRequest('post', '/api/sync/operations', admin.sessionToken, adminCsrf, staleOperation).expect(409);
    expect(conflict.body).toMatchObject({
      status: 'conflict',
      reason: 'version_mismatch',
      serverCard: { id: cardId, version: 2, name: 'Cartão alterado no outro aparelho' },
    });

    const resolved = await sessionRequest('post', '/api/sync/operations', admin.sessionToken, adminCsrf, {
      ...staleOperation,
      operationId: randomUUID(),
      baseVersion: conflict.body.serverCard.version,
    }).expect(200);
    expect(resolved.body).toMatchObject({
      status: 'applied',
      card: { id: cardId, version: 3, name: 'Minha alteração offline', updated_by_user_id: admin.id },
    });
    const stored = await pool.query('SELECT count(*)::integer AS count, min(version)::integer AS version FROM credit_cards WHERE id = $1', [
      cardId,
    ]);
    expect(stored.rows[0]).toEqual({ count: 1, version: 3 });
  });

  it('uses versions for concurrent edits and edit-versus-delete decisions', async () => {
    const admin = await createSpaceUser({ email: 'sync-admin@example.test', name: 'Admin versões' });
    const adminCsrf = (await sameOrigin(request.agent(app), 'get', '/api/auth/state').expect(200)).body.csrfToken;
    const member = await createMember(admin, adminCsrf, 'Membro versões');

    const concurrent = await createEntry(admin.sessionToken, adminCsrf, admin.spaceId, 'Edições simultâneas');
    const competingUpdates = [
      offlineOperation({
        kind: 'update',
        entryId: concurrent.id,
        baseVersion: 1,
        payload: {
          kind: concurrent.kind,
          description: 'Edição simultânea A',
          categoryId: concurrent.category_id,
          competenceOn: concurrent.competence_on,
          dueOn: concurrent.due_on,
          plannedCents: 12600,
          paymentMethodId: null,
          notes: null,
        },
      }),
      offlineOperation({
        kind: 'update',
        entryId: concurrent.id,
        baseVersion: 1,
        payload: {
          kind: concurrent.kind,
          description: 'Edição simultânea B',
          categoryId: concurrent.category_id,
          competenceOn: concurrent.competence_on,
          dueOn: concurrent.due_on,
          plannedCents: 12700,
          paymentMethodId: null,
          notes: null,
        },
      }),
    ];
    const competingResponses = await Promise.all([
      sessionRequest('post', '/api/sync/operations', admin.sessionToken, adminCsrf, competingUpdates[0]),
      sessionRequest('post', '/api/sync/operations', member.sessionToken, member.csrfToken, competingUpdates[1]),
    ]);
    expect(competingResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(competingResponses.find(({ status }) => status === 409)?.body).toMatchObject({
      status: 'conflict',
      reason: 'version_mismatch',
      serverEntry: { version: 2 },
    });
    const concurrentAudit = await pool.query(
      "SELECT count(*)::integer AS count FROM financial_entry_audit WHERE entry_id = $1 AND action = 'updated'",
      [concurrent.id],
    );
    expect(concurrentAudit.rows[0].count).toBe(1);

    const editDeleteRace = await createEntry(admin.sessionToken, adminCsrf, admin.spaceId, 'Edição contra exclusão');
    const raceUpdate = offlineOperation({
      kind: 'update',
      entryId: editDeleteRace.id,
      baseVersion: 1,
      payload: {
        kind: editDeleteRace.kind,
        description: 'Atualizado na corrida',
        categoryId: editDeleteRace.category_id,
        competenceOn: editDeleteRace.competence_on,
        dueOn: editDeleteRace.due_on,
        plannedCents: 13000,
        paymentMethodId: null,
        notes: null,
      },
    });
    const raceDelete = offlineOperation({ kind: 'delete', entryId: editDeleteRace.id, baseVersion: 1 });
    const raceResponses = await Promise.all([
      sessionRequest('post', '/api/sync/operations', admin.sessionToken, adminCsrf, raceUpdate),
      sessionRequest('post', '/api/sync/operations', member.sessionToken, member.csrfToken, raceDelete),
    ]);
    expect(raceResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const raceConflict = raceResponses.find(({ status }) => status === 409);
    expect(['version_mismatch', 'server_deleted']).toContain(raceConflict?.body.reason);

    const original = await createEntry(admin.sessionToken, adminCsrf, admin.spaceId, 'Registro para conflito');

    const adminEdit = await sessionRequest('put', `/api/entries/${original.id}`, admin.sessionToken, adminCsrf, {
      kind: original.kind,
      description: 'Versão do administrador',
      categoryId: original.category_id,
      competenceOn: original.competence_on,
      dueOn: original.due_on,
      plannedCents: 12500,
      paymentMethodId: null,
      notes: null,
      baseVersion: original.version,
    }).expect(200);
    expect(adminEdit.body.entry.version).toBe(2);

    const localUpdate = offlineOperation({
      kind: 'update',
      entryId: original.id,
      baseVersion: 1,
      payload: {
        kind: original.kind,
        description: 'Versão local do membro',
        categoryId: original.category_id,
        competenceOn: original.competence_on,
        dueOn: original.due_on,
        plannedCents: 14500,
        paymentMethodId: null,
        notes: null,
      },
    });
    const conflict = await sessionRequest('post', '/api/sync/operations', member.sessionToken, member.csrfToken, localUpdate).expect(409);
    expect(conflict.body).toMatchObject({
      status: 'conflict',
      reason: 'version_mismatch',
      serverEntry: { version: 2, description: 'Versão do administrador' },
    });
    const resolved = await sessionRequest('post', '/api/sync/operations', member.sessionToken, member.csrfToken, {
      ...localUpdate,
      operationId: randomUUID(),
      baseVersion: conflict.body.serverEntry.version,
    }).expect(200);
    expect(resolved.body.entry).toMatchObject({ version: 3, description: 'Versão local do membro', updated_by_user_id: member.user.id });

    const deleteEntry = await createEntry(admin.sessionToken, adminCsrf, admin.spaceId, 'Registro para exclusão concorrente');
    await sessionRequest('put', `/api/entries/${deleteEntry.id}`, admin.sessionToken, adminCsrf, {
      kind: deleteEntry.kind,
      description: 'Edição anterior à exclusão',
      categoryId: deleteEntry.category_id,
      competenceOn: deleteEntry.competence_on,
      dueOn: deleteEntry.due_on,
      plannedCents: 12500,
      paymentMethodId: null,
      notes: null,
      baseVersion: 1,
    }).expect(200);
    const deletion = offlineOperation({ kind: 'delete', entryId: deleteEntry.id, baseVersion: 1 });
    const deleteConflict = await sessionRequest('post', '/api/sync/operations', member.sessionToken, member.csrfToken, deletion).expect(
      409,
    );
    expect(deleteConflict.body).toMatchObject({
      reason: 'version_mismatch',
      serverEntry: { version: 2, description: 'Edição anterior à exclusão' },
    });
    const localDelete = await sessionRequest('post', '/api/sync/operations', member.sessionToken, member.csrfToken, {
      ...deletion,
      operationId: randomUUID(),
      baseVersion: deleteConflict.body.serverEntry.version,
    }).expect(200);
    expect(localDelete.body).toMatchObject({ status: 'applied', deleted: true });
    await sessionRequest('get', `/api/entries/${deleteEntry.id}`, admin.sessionToken, adminCsrf).expect(404);
  }, 15_000);

  it('keeps offline updates when the server deleted an entry and rejects a deactivated member', async () => {
    const admin = await createSpaceUser({ email: 'sync-delete-admin@example.test', name: 'Admin exclusão' });
    const adminCsrf = (await sameOrigin(request.agent(app), 'get', '/api/auth/state').expect(200)).body.csrfToken;
    const member = await createMember(admin, adminCsrf, 'Membro desativado');
    const original = await createEntry(admin.sessionToken, adminCsrf, admin.spaceId, 'Registro removido pelo servidor');
    await sessionRequest('delete', `/api/entries/${original.id}`, admin.sessionToken, adminCsrf, undefined).expect(204);

    const localUpdate = offlineOperation({
      kind: 'update',
      entryId: original.id,
      baseVersion: 1,
      payload: {
        kind: original.kind,
        description: 'Alteração local preservada',
        categoryId: original.category_id,
        competenceOn: original.competence_on,
        dueOn: original.due_on,
        plannedCents: 12500,
        paymentMethodId: null,
        notes: null,
      },
    });
    const removedConflict = await sessionRequest('post', '/api/sync/operations', member.sessionToken, member.csrfToken, localUpdate).expect(
      409,
    );
    expect(removedConflict.body).toMatchObject({ status: 'conflict', reason: 'server_deleted', serverEntry: null });

    await sessionRequest('post', `/api/members/${member.user.id}/deactivate`, admin.sessionToken, adminCsrf).expect(204);
    await sessionRequest('post', '/api/sync/operations', member.sessionToken, member.csrfToken, localUpdate).expect(401);
    const remaining = await pool.query('SELECT count(*)::integer AS count FROM financial_entries WHERE description = $1', [
      'Alteração local preservada',
    ]);
    expect(remaining.rows[0].count).toBe(0);
  });

  it('keeps an offline manual recurrence skip distinct when its rule is expanded', async () => {
    const admin = await createSpaceUser({ email: 'sync-recurrence-admin@example.test', name: 'Admin recorrência offline' });
    const csrfToken = (await sameOrigin(request.agent(app), 'get', '/api/auth/state').expect(200)).body.csrfToken;
    const category = await sessionRequest('post', '/api/catalog/categories', admin.sessionToken, csrfToken, {
      name: 'Moradia offline fictícia',
      kind: 'expense',
      expenseClass: 'fixed',
    }).expect(201);
    const monthResult = await pool.query(
      "SELECT to_char(date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS current_month",
    );
    const [year, month] = monthResult.rows[0].current_month.slice(0, 7).split('-').map(Number);
    const futureMonth = (offset) => new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 10);
    const rule = await sessionRequest('post', '/api/recurrences', admin.sessionToken, csrfToken, {
      kind: 'expense',
      description: 'Serviço offline fictício',
      categoryId: category.body.category.id,
      startCompetenceOn: monthResult.rows[0].current_month,
      endCompetenceOn: futureMonth(2),
      dueDay: 10,
      plannedCents: 2500,
    }).expect(201);
    const occurrence = await pool.query(
      `
      SELECT id, version FROM financial_entries
      WHERE recurrence_rule_id = $1 AND competence_on = $2
    `,
      [rule.body.rule.id, futureMonth(1)],
    );

    const deleted = await sessionRequest(
      'post',
      '/api/sync/operations',
      admin.sessionToken,
      csrfToken,
      offlineOperation({ kind: 'delete', entryId: occurrence.rows[0].id, baseVersion: occurrence.rows[0].version }),
    ).expect(200);
    expect(deleted.body).toMatchObject({ status: 'applied', deleted: true });
    const manualSkip = await pool.query('SELECT recurrence_skipped, recurrence_skip_reason FROM financial_entries WHERE id = $1', [
      occurrence.rows[0].id,
    ]);
    expect(manualSkip.rows).toEqual([{ recurrence_skipped: true, recurrence_skip_reason: 'user' }]);

    await sessionRequest('put', `/api/recurrences/${rule.body.rule.id}`, admin.sessionToken, csrfToken, {
      kind: 'expense',
      description: 'Serviço atualizado fictício',
      categoryId: category.body.category.id,
      startCompetenceOn: monthResult.rows[0].current_month,
      endCompetenceOn: futureMonth(3),
      dueDay: 15,
      plannedCents: 3000,
    }).expect(200);
    const stillManual = await pool.query('SELECT recurrence_skipped, recurrence_skip_reason FROM financial_entries WHERE id = $1', [
      occurrence.rows[0].id,
    ]);
    expect(stillManual.rows).toEqual([{ recurrence_skipped: true, recurrence_skip_reason: 'user' }]);
  });
});
