import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function syntheticWorkbook() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Descrição da Conta', 'Categoria', 'Dia de Vencimento', 'Valor Previsto (R$)', 'Forma de Pagamento', 'Status', 'Data de Pagamento', 'Observações'],
    ['Conta sintética importada', 'Moradia fictícia', 15, '$50.00', 'Pix fictício', 'Em aberto', '', 'Fixture de navegador'],
  ]), 'Contas e Vencimentos');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Mês', 'Receitas Previstas'],
  ]), 'Fluxo de Caixa Mensal');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('administra um espaço compartilhado, importa e sincroniza uma alteração offline', async ({ browser }) => {
  const month = currentMonth();
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();

  await admin.goto('/');
  await expect(admin.getByRole('heading', { name: 'Configure o espaço da família' })).toBeVisible();
  await admin.getByLabel('Seu nome').fill('Administradora fictícia');
  await admin.getByLabel('E-mail').fill('admin@example.test');
  await admin.getByLabel('Senha').fill('senha-ficticia-admin-2026');
  await admin.getByRole('button', { name: 'Criar meu acesso' }).click();
  await expect(admin.getByRole('heading', { name: 'Visão geral' })).toBeVisible();

  for (const width of [320, 360, 390, 430]) {
    await admin.setViewportSize({ width, height: 844 });
    const mobileNav = admin.getByRole('navigation', { name: 'Navegação principal móvel' });
    await expect(mobileNav).toBeVisible();
    expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const navigationItems = await mobileNav.locator('a, button').evaluateAll((items) => items.map((item) => {
      const rect = item.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width };
    }));
    expect(navigationItems).toHaveLength(5);
    expect(navigationItems.every((item) => item.width >= 44 && item.left >= 0 && item.right <= width)).toBe(true);
    for (let index = 0; index < navigationItems.length - 1; index += 1) {
      expect(navigationItems[index].right).toBeLessThanOrEqual(navigationItems[index + 1].left + 1);
    }
    const clippedLabels = await mobileNav.locator('span').evaluateAll((labels) => labels.some((label) => label.scrollWidth > label.clientWidth + 1));
    expect(clippedLabels).toBe(false);
  }

  await admin.setViewportSize({ width: 390, height: 844 });
  const mobileNav = admin.getByRole('navigation', { name: 'Navegação principal móvel' });
  for (const [linkName, headingName] of [
    ['Lançamentos', 'Lançamentos'],
    ['Compras', 'Compras parceladas'],
    ['Faturas', 'Faturas'],
  ]) {
    await mobileNav.getByRole('link', { name: linkName }).click();
    await expect(admin.getByRole('heading', { name: headingName, exact: true })).toBeVisible();
  }
  await mobileNav.getByRole('link', { name: 'Visão geral' }).click();
  await expect(admin.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();

  const moreButton = mobileNav.getByRole('button', { name: /^Mais páginas/ });
  await moreButton.click();
  const moreNav = admin.getByRole('navigation', { name: 'Mais páginas' });
  await expect(moreNav).toBeVisible();
  await expect(moreNav.getByRole('link', { name: 'Recorrências' })).toBeVisible();
  await expect(moreNav.getByRole('link', { name: 'Histórico' })).toBeVisible();
  await expect(moreNav.getByRole('link', { name: 'Configurações' })).toBeVisible();
  await admin.keyboard.press('Escape');
  await expect(moreNav).toBeHidden();
  await expect(moreButton).toBeFocused();
  for (const pageName of ['Recorrências', 'Histórico', 'Configurações']) {
    await moreButton.click();
    await moreNav.getByRole('link', { name: pageName }).click();
    await expect(admin.getByRole('heading', { name: pageName, exact: true })).toBeVisible();
  }
  await expect(moreButton).toBeFocused();
  await expect(moreButton).toHaveAttribute('aria-current', 'page');
  await expect(moreButton).toHaveAccessibleName('Mais páginas, página atual: Configurações');
  await mobileNav.getByRole('link', { name: 'Visão geral' }).click();
  await expect(admin.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
  await admin.setViewportSize({ width: 1280, height: 900 });

  await admin.getByRole('link', { name: 'Configurações' }).click();
  await admin.getByLabel('Nome da categoria').fill('Moradia fictícia');
  await admin.getByRole('button', { name: 'Adicionar categoria' }).click();
  await expect(admin.getByText('Moradia fictícia')).toBeVisible();
  await admin.getByLabel('Nome da forma de pagamento').fill('Pix fictício');
  await admin.getByRole('button', { name: 'Adicionar forma' }).click();
  await expect(admin.getByText('Pix fictício')).toBeVisible();
  await admin.getByLabel('Apelido do cartão').fill('Cartão da família fictício');
  await admin.getByLabel('Titular').selectOption({ label: 'Administradora fictícia' });
  await admin.getByLabel('Dia de fechamento').fill('31');
  await admin.getByLabel('Dia de vencimento').fill('5');
  await admin.getByRole('button', { name: 'Adicionar cartão' }).click();
  await expect(admin.getByText('Administradora fictícia · fecha dia 31 · vence dia 5')).toBeVisible();

  await admin.getByRole('link', { name: 'Compras' }).click();
  await admin.getByRole('button', { name: 'Nova compra' }).click();
  const purchaseCard = admin.getByLabel('Cartão', { exact: true });
  const purchaseCategory = admin.getByLabel('Categoria de despesa', { exact: true });
  await purchaseCard.selectOption({ label: 'Cartão da família fictício · vence dia 5' });
  await purchaseCategory.selectOption({ label: 'Moradia fictícia' });
  await admin.getByLabel('Descrição').fill('Compra parcelada fictícia');
  await admin.getByLabel('Data da compra').fill('2026-10-31');
  await admin.getByLabel('Valor total (R$)').fill('10,01');
  await admin.getByLabel('Quantidade de parcelas').fill('3');
  await expect(admin.getByLabel('Primeira fatura')).toHaveValue('2026-11');
  await admin.setViewportSize({ width: 390, height: 844 });
  expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await purchaseCard.focus();
  await admin.keyboard.press('Tab');
  await expect(purchaseCategory).toBeFocused();
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.getByRole('button', { name: 'Salvar compra' }).click();
  await expect(admin.getByText('Compra parcelada fictícia')).toBeVisible();
  await admin.getByText('Ver parcelas').click();
  await expect(admin.getByText('Parcela 1/3 · fatura 11/2026 · vence 05/11/2026')).toBeVisible();

  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.getByRole('link', { name: 'Faturas' }).click();
  await admin.getByLabel('Mês de vencimento').fill('2026-11');
  await expect(admin.getByText('Compra parcelada fictícia')).toBeVisible();
  await expect(admin.getByText('3,34', { exact: false }).first()).toBeVisible();
  expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const payButton = admin.getByRole('button', { name: 'Quitar fatura' });
  await payButton.click();
  await expect(admin.getByRole('dialog', { name: 'Quitar fatura' })).toBeVisible();
  await admin.keyboard.press('Escape');
  await expect(admin.getByRole('dialog', { name: 'Quitar fatura' })).toHaveCount(0);
  await expect(payButton).toBeFocused();
  await payButton.click();
  const paymentDialog = admin.getByRole('dialog', { name: 'Quitar fatura' });
  await expect(paymentDialog).toBeVisible();
  await expect(admin.getByLabel('Valor efetivamente pago')).toBeFocused();
  await admin.keyboard.press('Tab');
  await expect(admin.getByLabel('Data do pagamento')).toBeFocused();
  await admin.getByLabel('Valor efetivamente pago').fill('3,01');
  await admin.getByLabel('Data do pagamento').fill('05/11/2026');
  await expect(admin.getByLabel('Forma de pagamento (opcional)').locator('option')).toHaveCount(2);
  await admin.getByLabel('Forma de pagamento (opcional)').selectOption({ label: 'Pix fictício' });
  await admin.getByRole('button', { name: 'Confirmar quitação' }).click();
  await expect(admin.getByText('Quitada', { exact: true })).toBeVisible();
  await expect(admin.getByText('Pendente neste aparelho')).toHaveCount(0, { timeout: 20_000 });
  await admin.setViewportSize({ width: 1280, height: 900 });

  await admin.getByRole('link', { name: 'Visão geral' }).click();
  const dashboardRequest = admin.waitForResponse((response) => response.url().includes('/api/dashboard?month=2026-11'));
  await admin.getByLabel('Mês do painel').fill('2026-11');
  const dashboardResponse = await (await dashboardRequest).json();
  expect(dashboardResponse).toMatchObject({ planned: { expenseCents: '334' }, realized: { expenseCents: '301' } });
  const novemberExpenses = admin.getByRole('table').getByRole('row', { name: /Despesas/ });
  await expect(novemberExpenses).toContainText('3,34');
  await expect(novemberExpenses).toContainText('3,01');

  await admin.getByRole('link', { name: 'Lançamentos' }).click();
  await admin.getByLabel('Competência').fill('2026-11');
  await expect(admin.getByText('Compra parcelada fictícia (1/3)')).toBeVisible();
  await admin.evaluate(() => {
    const createObjectURL = URL.createObjectURL.bind(URL);
    Object.defineProperty(window, '__contaClaraCsv', { value: '', writable: true });
    URL.createObjectURL = (blob) => {
      void blob.text().then((content) => { window.__contaClaraCsv = content; });
      return createObjectURL(blob);
    };
  });
  const [csvDownload] = await Promise.all([
    admin.waitForEvent('download'),
    admin.getByRole('button', { name: 'Exportar CSV' }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe('conta-clara-lancamentos-2026-11.csv');
  await expect.poll(() => admin.evaluate(() => window.__contaClaraCsv)).toContain('"Cartão da família fictício"');
  const csvContent = await admin.evaluate(() => window.__contaClaraCsv);
  expect(csvContent).toContain('"11/2026"');
  expect(csvContent).toContain('"1/3"');
  expect(csvContent).toContain('"Quitada"');

  await admin.getByRole('link', { name: 'Configurações' }).click();
  await admin.setViewportSize({ width: 390, height: 844 });
  await expect(admin.getByLabel('Apelido do cartão')).toBeVisible();
  await expect(admin.getByText('Cartão da família fictício')).toBeVisible();
  expect(await admin.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await admin.getByLabel('Apelido do cartão').focus();
  await admin.keyboard.press('Tab');
  await expect(admin.getByLabel('Titular')).toBeFocused();
  await admin.setViewportSize({ width: 1280, height: 900 });

  await admin.getByRole('link', { name: 'Recorrências' }).click();
  await admin.getByRole('link', { name: 'Nova regra' }).first().click();
  await admin.getByLabel('Descrição').fill('Moradia recorrente fictícia');
  await admin.locator('#recurrence-category').selectOption({ label: 'Moradia fictícia' });
  await admin.locator('#recurrence-payment-method').selectOption({ label: 'Pix fictício' });
  await admin.getByLabel('Mês de início').fill(month);
  await admin.getByLabel('Dia de vencimento').fill('15');
  await admin.getByLabel('Valor previsto (R$)').fill('20,00');
  await admin.getByRole('button', { name: 'Criar regra' }).click();
  await expect(admin.getByText('Moradia recorrente fictícia')).toBeVisible();

  await admin.getByRole('link', { name: 'Lançamentos' }).click();
  await admin.getByRole('link', { name: 'Importar planilha' }).click();
  await admin.getByLabel('Arquivo XLSX').setInputFiles({
    name: 'planilha-sintetica.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: syntheticWorkbook(),
  });
  await admin.getByRole('button', { name: 'Gerar prévia' }).click();
  await expect(admin.getByRole('heading', { name: '2. Revise o que será importado' })).toBeVisible();
  await admin.getByRole('button', { name: /Revisar e confirmar 1 lançamentos/ }).click();
  await admin.getByRole('button', { name: 'Confirmar e importar' }).click();
  await expect(admin.locator('p[role="status"]')).toContainText('1 lançamentos foram importados');
  await admin.getByRole('link', { name: 'Ver lançamentos' }).click();
  await expect(admin.getByText('Conta sintética importada')).toBeVisible();
  await expect(admin.getByText('Moradia recorrente fictícia')).toBeVisible();

  await admin.getByRole('button', { name: 'Confirmar Conta sintética importada' }).click();
  const confirmation = admin.getByRole('form', { name: 'Confirmar lançamento Conta sintética importada' });
  await confirmation.getByRole('button', { name: 'Salvar realização' }).click();
  await expect(admin.getByLabel('Situação: Pago')).toBeVisible();

  await admin.getByRole('link', { name: 'Visão geral' }).click();
  const expenses = admin.getByRole('table').getByRole('row', { name: /Despesas/ });
  await expect(expenses).toContainText('70,00');
  await expect(expenses).toContainText('50,00');

  await admin.getByRole('link', { name: 'Configurações' }).click();
  await admin.getByLabel('E-mail da pessoa').fill('membro@example.test');
  await admin.getByRole('button', { name: 'Gerar convite' }).click();
  const inviteUrl = await admin.getByRole('textbox', { name: 'Link de acesso' }).inputValue();

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(inviteUrl);
  await expect(member.getByRole('heading', { name: 'Ativar convite', level: 1 })).toBeVisible();
  await member.getByLabel('Seu nome').fill('Membro fictício');
  await member.getByLabel('Nova senha').fill('senha-ficticia-membro-2026');
  await member.getByLabel('Confirme a senha').fill('senha-ficticia-membro-2026');
  await member.getByRole('button', { name: 'Ativar acesso' }).click();
  await expect(member.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
  await expect.poll(() => member.evaluate(() => Boolean(navigator.serviceWorker?.controller))).toBe(true);
  const cachedUrls = await member.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) =>
    (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname),
  ))).flat());
  expect(cachedUrls).toContain('/');
  expect(cachedUrls.some((url) => url.endsWith('.js'))).toBe(true);

  await member.getByRole('link', { name: 'Compras' }).click();
  await expect(member.getByText('Compra parcelada fictícia')).toBeVisible();

  await member.getByRole('link', { name: 'Configurações' }).click();
  await expect(member.getByRole('list').getByText('Administradora fictícia')).toBeVisible();
  await expect(member.getByText('Cartão da família fictício')).toBeVisible();
  await expect(member.getByRole('button', { name: 'Gerar convite' })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'Link para redefinir senha' })).toHaveCount(0);

  await member.getByRole('link', { name: 'Faturas' }).click();
  await member.getByLabel('Mês de vencimento').fill('2026-12');
  await expect(member.getByRole('button', { name: 'Quitar fatura' })).toBeVisible();
  await memberContext.setOffline(true);
  await member.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(member.getByText(/^Sem conexão de rede/)).toBeVisible();
  await member.getByRole('button', { name: 'Quitar fatura' }).click();
  await member.getByLabel('Valor efetivamente pago').fill('3,50');
  await member.getByLabel('Data do pagamento').fill('06/12/2026');
  await member.getByRole('button', { name: 'Confirmar quitação' }).click();
  await expect(member.getByText('Pendente neste aparelho')).toBeVisible();
  await expect(member.getByText('Quitada', { exact: true })).toBeVisible();

  await admin.getByRole('link', { name: 'Faturas' }).click();
  await admin.getByLabel('Mês de vencimento').fill('2026-12');
  await admin.getByRole('button', { name: 'Quitar fatura' }).click();
  await admin.getByLabel('Data do pagamento').fill('05/12/2026');
  await admin.getByRole('button', { name: 'Confirmar quitação' }).click();
  await expect(admin.getByText('Quitada', { exact: true })).toBeVisible();
  await expect(admin.getByText('Pendente neste aparelho')).toHaveCount(0, { timeout: 20_000 });

  await memberContext.setOffline(false);
  await member.evaluate(() => window.dispatchEvent(new Event('online')));
  const invoiceConflictHeading = member.getByRole('heading', { name: 'Revise as quitações que mudaram offline' });
  await expect(invoiceConflictHeading).toBeVisible({ timeout: 20_000 });
  const invoiceConflict = invoiceConflictHeading.locator('..').locator('..');
  await expect(invoiceConflict).toContainText('3,34');
  await expect(invoiceConflict).toContainText('05/12/2026');
  await member.getByRole('button', { name: 'Manter versão do servidor' }).click();
  await expect(member.getByText('Rede conectada · nenhuma alteração pendente.')).toBeVisible({ timeout: 20_000 });
  await expect(member.getByText('Quitada por', { exact: false })).toContainText('3,34');

  await member.getByRole('link', { name: 'Lançamentos' }).click();
  await expect(member.getByText('Conta sintética importada')).toBeVisible();
  await expect(member.getByText('Moradia recorrente fictícia')).toBeVisible();
  await member.getByRole('link', { name: 'Adicionar lançamento' }).click();
  await expect(member.getByRole('heading', { name: 'Adicionar lançamento' })).toBeVisible();
  await memberContext.setOffline(true);
  await member.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(member.getByText(/^Sem conexão de rede/)).toBeVisible();
  await member.getByLabel('Descrição').fill('Despesa offline fictícia');
  await member.locator('#entry-category').selectOption({ label: 'Moradia fictícia' });
  await member.getByLabel('Valor previsto (R$)').fill('12,00');
  await expect(member.getByLabel('Descrição')).toHaveValue('Despesa offline fictícia');
  await expect(member.getByRole('button', { name: 'Salvar lançamento' })).toBeEnabled();
  await member.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(member).toHaveURL(/\/lancamentos$/);
  await expect(member.getByText('Despesa offline fictícia')).toBeVisible();
  await expect(member.getByText(/Pendente neste aparelho/)).toBeVisible();

  await member.getByRole('link', { name: 'Compras' }).click();
  await member.getByRole('button', { name: 'Nova compra' }).click();
  await member.getByLabel('Cartão', { exact: true }).selectOption({ label: 'Cartão da família fictício · vence dia 5' });
  await member.getByLabel('Categoria de despesa', { exact: true }).selectOption({ label: 'Moradia fictícia' });
  await member.getByLabel('Descrição').fill('Compra offline fictícia');
  await member.getByLabel('Data da compra').fill('2026-10-26');
  await member.getByLabel('Valor total (R$)').fill('20,00');
  await member.getByLabel('Quantidade de parcelas').fill('2');
  await member.getByRole('button', { name: 'Salvar compra' }).click();
  await expect(member.getByText('Compra offline fictícia')).toBeVisible();
  await expect(member.getByText(/Pendente neste aparelho/)).toBeVisible();
  await member.reload();
  await expect(member.getByText('Compra offline fictícia')).toBeVisible();
  await expect(member.getByText(/Pendente neste aparelho/)).toBeVisible();

  await member.getByRole('link', { name: 'Configurações' }).click();
  await member.getByRole('button', { name: 'Editar cartão Cartão da família fictício' }).click();
  await member.getByLabel('Apelido do cartão').fill('Cartão da família atualizado offline');
  await member.getByRole('button', { name: 'Salvar cartão' }).click();
  await expect(member.getByText('Cartão da família atualizado offline')).toBeVisible();
  await member.getByRole('button', { name: 'Arquivar cartão Cartão da família atualizado offline' }).click();
  await expect(member.getByText('Arquivado')).toBeVisible();
  await expect(member.getByText(/3 alterações.*aguardam sincronização/)).toBeVisible();

  await memberContext.setOffline(false);
  await member.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(member.getByText('Rede conectada · nenhuma alteração pendente.')).toBeVisible({ timeout: 20_000 });
  await member.getByRole('link', { name: 'Lançamentos' }).click();
  await expect(member.getByText('Despesa offline fictícia')).toBeVisible();
  await expect(member.getByText(/Pendente neste aparelho/)).toHaveCount(0, { timeout: 20_000 });
  await member.getByRole('link', { name: 'Compras' }).click();
  await expect(member.getByText('Compra offline fictícia')).toBeVisible();
  await expect(member.getByText(/Pendente neste aparelho/)).toHaveCount(0, { timeout: 20_000 });
  const purchasesAfterReconnect = await member.evaluate(async () => (await (await fetch('/api/purchases')).json()).purchases);
  const syncedOfflinePurchase = purchasesAfterReconnect.filter((purchase) => purchase.description === 'Compra offline fictícia');
  expect(syncedOfflinePurchase).toHaveLength(1);
  expect(syncedOfflinePurchase[0].installments).toHaveLength(2);
  await member.reload();
  await member.getByRole('link', { name: 'Configurações' }).click();
  await member.getByRole('link', { name: 'Configurações' }).click();
  await expect(member.getByText('Cartão da família atualizado offline')).toBeVisible();
  await expect(member.getByRole('button', { name: 'Restaurar cartão Cartão da família atualizado offline' })).toBeVisible();
  await member.getByRole('button', { name: 'Restaurar cartão Cartão da família atualizado offline' }).click();
  await expect(member.getByRole('button', { name: 'Arquivar cartão Cartão da família atualizado offline' })).toBeVisible();

  await memberContext.close();
  await adminContext.close();
});
