// Dados fictícios e determinísticos dos testes visuais, criados pela própria API.
// Tudo gira em torno de junho de 2099 (o relógio do navegador é fixado em 15/06/2099), então as telas não mudam com o
// tempo. Para o servidor, que usa a data real, os vencimentos de 2099 são sempre "em aberto" e o de 2000 é sempre "atrasado".

export const sessionPath = 'test-results/visual-session.json';

export const fixedNow = new Date('2099-06-15T15:00:00.000Z');

const admin = { displayName: 'Administradora fictícia', email: 'admin@example.test', password: 'senha-ficticia-admin-2026' };
export const visualAdmin = admin;

const purchaseId = '8d6f3c1e-6c5b-4d0e-9a41-0a1b2c3d4e01';
const installmentIds = [
  '8d6f3c1e-6c5b-4d0e-9a41-0a1b2c3d4e11',
  '8d6f3c1e-6c5b-4d0e-9a41-0a1b2c3d4e12',
  '8d6f3c1e-6c5b-4d0e-9a41-0a1b2c3d4e13',
];
const operationId = '8d6f3c1e-6c5b-4d0e-9a41-0a1b2c3d4e21';

async function expectOk(response, label) {
  if (!response.ok()) throw new Error(`${label}: ${response.status()} ${await response.text()}`);
  return response.json();
}

export async function seedVisualData(api, baseURL) {
  const state = await expectOk(await api.get('/api/auth/state'), 'estado da autenticação');
  const headers = { 'X-CSRF-Token': state.csrfToken, Origin: baseURL };
  const post = async (path, body, extra = {}) =>
    expectOk(await api.post(path, { data: body, headers: { ...headers, ...extra } }), `POST ${path}`);

  const setup = await post('/api/auth/setup', admin);
  const userId = setup.user.id;

  const category = async (name, kind, expenseClass = null) =>
    (await post('/api/catalog/categories', { name, kind, expenseClass })).category.id;
  const housing = await category('Moradia fictícia', 'expense', 'fixed');
  const groceries = await category('Mercado fictício', 'expense', 'variable');
  const salary = await category('Renda fictícia', 'income');
  const savings = await category('Reserva fictícia', 'investment');
  const pix = (await post('/api/catalog/payment-methods', { name: 'Pix fictício' })).paymentMethod.id;
  await post('/api/catalog/payment-methods', { name: 'Dinheiro fictício' });

  const entry = async (fields) =>
    (
      await post('/api/entries', {
        kind: 'expense',
        categoryId: null,
        paymentMethodId: null,
        notes: null,
        competenceOn: '2099-06-01',
        ...fields,
      })
    ).entry;
  const confirmed = async (created, actualCents, realizedOn) =>
    post(`/api/entries/${created.id}/confirm`, { actualCents, realizedOn }, { 'X-Entry-Version': String(created.version) });

  const salaryEntry = await entry({
    kind: 'income',
    description: 'Salário fictício',
    categoryId: salary,
    dueOn: '2099-06-05',
    plannedCents: 350000,
    paymentMethodId: pix,
  });
  await confirmed(salaryEntry, 350000, '2099-06-05');
  await entry({ description: 'Aluguel fictício', categoryId: housing, dueOn: '2099-06-10', plannedCents: 150000, paymentMethodId: pix });
  const groceriesEntry = await entry({
    description: 'Mercado do mês fictício',
    categoryId: groceries,
    dueOn: '2099-06-12',
    plannedCents: 80000,
  });
  await confirmed(groceriesEntry, 76550, '2099-06-12');
  await entry({ description: 'Internet fictícia', categoryId: housing, dueOn: '2000-01-10', plannedCents: 9990 });
  await entry({ kind: 'investment', description: 'Aporte mensal fictício', categoryId: savings, dueOn: '2099-06-20', plannedCents: 50000 });
  await entry({ description: 'Anuidade sem vencimento fictícia', dueOn: null, plannedCents: 12000 });
  await entry({
    description: 'Revisão anual do seguro do veículo da família com cobertura ampliada',
    categoryId: housing,
    dueOn: '2099-06-20',
    plannedCents: 123456,
  });

  const card = (await post('/api/cards', { name: 'Cartão principal fictício', holderUserId: userId, closingDay: 25, dueDay: 5 })).card;
  await post('/api/sync/operations', {
    entity: 'purchase',
    operationId,
    purchaseId,
    kind: 'create',
    baseVersion: null,
    payload: {
      purchase: {
        cardId: card.id,
        categoryId: groceries,
        description: 'Eletrodoméstico fictício',
        purchaseOn: '2099-05-20',
        firstInvoiceOn: '2099-06-01',
        totalCents: 120000,
        installmentCount: 3,
      },
      installments: installmentIds.map((id, index) => ({
        id,
        installmentNumber: index + 1,
        plannedCents: 40000,
        invoiceOn: `2099-0${6 + index}-01`,
      })),
    },
  });

  await post('/api/recurrences', {
    kind: 'expense',
    description: 'Internet recorrente fictícia',
    categoryId: housing,
    paymentMethodId: pix,
    startCompetenceOn: '2099-06-01',
    endCompetenceOn: '2099-12-01',
    dueDay: 15,
    plannedCents: 9990,
    notes: null,
  });
  await post('/api/recurrences', {
    kind: 'income',
    description: 'Aluguel recebido fictício',
    categoryId: salary,
    paymentMethodId: null,
    startCompetenceOn: '2099-06-01',
    endCompetenceOn: null,
    dueDay: 31,
    plannedCents: 200000,
    notes: null,
  });
}
