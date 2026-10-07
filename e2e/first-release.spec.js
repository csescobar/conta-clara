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

  await admin.getByRole('link', { name: 'Configurações' }).click();
  await admin.getByLabel('Nome da categoria').fill('Moradia fictícia');
  await admin.getByRole('button', { name: 'Adicionar categoria' }).click();
  await expect(admin.getByText('Moradia fictícia')).toBeVisible();
  await admin.getByLabel('Nome da forma de pagamento').fill('Pix fictício');
  await admin.getByRole('button', { name: 'Adicionar forma' }).click();
  await expect(admin.getByText('Pix fictício')).toBeVisible();

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

  await member.getByRole('link', { name: 'Configurações' }).click();
  await expect(member.getByText('Administradora fictícia')).toBeVisible();
  await expect(member.getByRole('button', { name: 'Gerar convite' })).toHaveCount(0);
  await expect(member.getByRole('button', { name: 'Link para redefinir senha' })).toHaveCount(0);

  await member.getByRole('link', { name: 'Lançamentos' }).click();
  await expect(member.getByText('Conta sintética importada')).toBeVisible();
  await expect(member.getByText('Moradia recorrente fictícia')).toBeVisible();
  await member.getByRole('link', { name: 'Adicionar lançamento' }).click();
  await expect(member.getByRole('heading', { name: 'Adicionar lançamento' })).toBeVisible();
  await memberContext.setOffline(true);
  await expect(member.getByRole('status')).toContainText('Sem conexão de rede');
  await member.getByLabel('Descrição').fill('Despesa offline fictícia');
  await member.locator('#entry-category').selectOption({ label: 'Moradia fictícia' });
  await member.getByLabel('Valor previsto (R$)').fill('12,00');
  await expect(member.getByLabel('Descrição')).toHaveValue('Despesa offline fictícia');
  await expect(member.getByRole('button', { name: 'Salvar lançamento' })).toBeEnabled();
  await member.getByRole('button', { name: 'Salvar lançamento' }).click();
  await expect(member).toHaveURL(/\/lancamentos$/);
  await expect(member.getByText('Despesa offline fictícia')).toBeVisible();
  await expect(member.getByText(/Pendente neste aparelho/)).toBeVisible();

  await memberContext.setOffline(false);
  await expect(member.getByText('Despesa offline fictícia')).toBeVisible();
  await expect(member.getByText(/Pendente neste aparelho/)).toHaveCount(0, { timeout: 20_000 });

  await memberContext.close();
  await adminContext.close();
});
