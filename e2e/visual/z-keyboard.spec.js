import { expect, test } from '@playwright/test';
import { fixedNow, sessionPath } from './seed.js';

// Roteiro de teclado: só Tab, Shift+Tab, Enter, Espaço, setas, Esc e F8. Não altera dados (roda depois das capturas).
test.use({ storageState: sessionPath, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' });

async function open(page, path, width = 1280, { app = true } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.clock.setFixedTime(fixedNow);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (app) {
    await expect(page.getByRole('status', { name: /^Carregando/ })).toHaveCount(0);
    await expect(page.getByText(/^Rede conectada/)).toBeVisible();
  }
  await page.evaluate(() => {
    window.__focusCounter = 0;
    document.activeElement?.blur?.();
  });
}

/** Elemento em foco: identidade estável (para detectar a volta ao início) e nome acessível aproximado. */
function focused(page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    element.__focusId ??= ++window.__focusCounter;
    const labelled = element.getAttribute('aria-label');
    const byLabel = element.labels?.[0]?.innerText;
    const name = (
      labelled ||
      byLabel ||
      element.innerText ||
      element.getAttribute('placeholder') ||
      element.getAttribute('name') ||
      element.tagName
    )
      .trim()
      .replace(/\s+/g, ' ');
    return { id: element.__focusId, name, role: element.getAttribute('role') ?? element.tagName.toLowerCase() };
  });
}

/** Pressiona Tab até o foco voltar ao primeiro elemento; devolve a ordem e se deu a volta completa. */
async function tabCycle(page, limit = 160) {
  const order = [];
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press('Tab');
    const current = await focused(page);
    if (!current) return { order, wrapped: true };
    if (order.length && current.id === order[0].id) return { order, wrapped: true };
    order.push(current);
  }
  return { order, wrapped: false };
}

const desktopNavigation = ['Visão geral', 'Lançamentos', 'Compras', 'Faturas', 'Recorrências', 'Histórico', 'Configurações', 'Sair'];
const routes = [
  ['/', ['Mês anterior', 'Próximo mês', 'Adicionar lançamento', 'Ver dados em tabela']],
  [
    '/lancamentos',
    [
      'Exportar CSV',
      'Importar planilha',
      'Adicionar lançamento',
      'Competência',
      'Categoria',
      'Situação',
      'Confirmar Aluguel fictício',
      'Editar Aluguel fictício',
      'Excluir Aluguel fictício',
    ],
  ],
  [
    '/lancamentos/novo',
    [
      'Despesa',
      'Descrição',
      'Categoria',
      'Mês de competência',
      'Valor previsto (R$)',
      'Vencimento',
      'Forma de pagamento',
      'Observações',
      'Salvar lançamento',
      'Cancelar',
    ],
  ],
  ['/compras', ['Nova compra', 'Editar série', 'Cancelar compra', 'Ver parcelas']],
  ['/faturas', ['Mês anterior', 'Mês de vencimento', 'Próximo mês', 'Quitar fatura']],
  ['/recorrencias', ['Nova regra', 'Editar regra Internet recorrente fictícia', 'Arquivar regra Internet recorrente fictícia']],
  [
    '/recorrencias/novo',
    [
      'Despesa',
      'Descrição',
      'Categoria',
      'Forma de pagamento',
      'Mês de início',
      'Mês de término',
      'Dia de vencimento',
      'Valor previsto (R$)',
      'Observações',
      'Criar regra',
      'Cancelar',
    ],
  ],
  ['/historico', []],
  [
    '/configuracoes',
    ['Seguir o sistema', 'E-mail da pessoa', 'Gerar convite', 'Nome da categoria', 'Adicionar categoria', 'Apelido do cartão'],
  ],
  // "Gerar prévia" fica desabilitado até escolher um arquivo e, por isso, corretamente não recebe foco.
  ['/importar', ['Voltar aos lançamentos', 'Arquivo XLSX', 'Ano para datas sem ano', 'Formato de datas e valores']],
];

test('o primeiro Tab leva ao link de pular e Enter move o foco para o conteúdo principal', async ({ page }) => {
  await open(page, '/');
  await page.keyboard.press('Tab');
  expect((await focused(page)).name).toBe('Pular para o conteúdo principal');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.keyboard.press('Tab');
  const next = await focused(page);
  expect(next.name).toMatch(/Mês anterior/);
});

for (const [path, expected] of routes) {
  test(`${path}: o Tab alcança a navegação e as ações da tela e dá a volta sem armadilha de foco`, async ({ page }) => {
    await open(page, path);
    const { order, wrapped } = await tabCycle(page);

    expect(wrapped, `o foco deve voltar ao início em até 160 Tabs (${order.length} elementos)`).toBe(true);
    const names = order.map((item) => item.name);
    for (const label of [...desktopNavigation, ...expected]) {
      expect(
        names.some((name) => name === label || name.includes(label)),
        `"${label}" deve receber foco em ${path}; ordem: ${names.join(' > ')}`,
      ).toBe(true);
    }
    // Nenhum elemento recebe foco duas vezes antes da volta completa.
    expect(new Set(order.map((item) => item.id)).size).toBe(order.length);
  });
}

test('no celular a navegação inferior e o botão Mais são alcançados pelo teclado', async ({ page }) => {
  await open(page, '/lancamentos', 390);
  const { order, wrapped } = await tabCycle(page);

  expect(wrapped).toBe(true);
  const names = order.map((item) => item.name);
  for (const label of [
    'Visão geral',
    'Compras',
    'Faturas',
    'Mais páginas',
    'Mais ações para Aluguel fictício',
    'Confirmar Aluguel fictício',
  ]) {
    expect(
      names.some((name) => name.includes(label)),
      `"${label}" no celular; ordem: ${names.join(' > ')}`,
    ).toBe(true);
  }
});

test('Shift+Tab percorre a mesma ordem ao contrário', async ({ page }) => {
  await open(page, '/lancamentos/novo');
  const forward = [];
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    forward.push((await focused(page)).id);
  }
  const backward = [];
  for (let step = 0; step < 7; step += 1) {
    await page.keyboard.press('Shift+Tab');
    backward.push((await focused(page)).id);
  }
  expect(backward).toEqual(forward.slice(0, 7).reverse());
});

test('o diálogo de exclusão prende o foco enquanto está aberto, fecha com Esc e devolve o foco ao botão', async ({ page }) => {
  await open(page, '/lancamentos');
  const trigger = page.getByRole('button', { name: 'Excluir Aluguel fictício' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();

  const seen = new Set();
  for (let step = 0; step < 6; step += 1) {
    const current = await focused(page);
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[role="alertdialog"]'))),
      'o foco fica dentro do diálogo',
    ).toBe(true);
    seen.add(current.name);
    await page.keyboard.press('Tab');
  }
  expect([...seen].sort()).toEqual(['Cancelar', 'Excluir lançamento']);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('F8 leva o foco à região de avisos, o botão Desfazer é alcançado pelo teclado e funciona', async ({ page }) => {
  await open(page, '/catalogo', 1280, { app: false });
  const trigger = page.getByRole('button', { name: 'Aviso com desfazer' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('A categoria “Casa” foi arquivada.', { exact: true })).toBeVisible();
  // O aviso não tira o foco do botão que o disparou.
  await expect(trigger).toBeFocused();

  await page.keyboard.press('F8');
  expect(
    await page.evaluate(() => document.activeElement?.closest('[role="region"]')?.getAttribute('aria-label') ?? ''),
    'o foco vai para a região de avisos',
  ).toMatch(/^Notificações/);
  // Do viewport o Tab passa pelo aviso e, em seguida, pelo botão de ação.
  const undo = page.getByRole('button', { name: 'Desfazer', exact: true });
  for (let step = 0; step < 4 && !(await undo.evaluate((element) => element === document.activeElement)); step += 1)
    await page.keyboard.press('Tab');
  await expect(undo).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('A categoria foi restaurada.', { exact: true })).toBeVisible();
});
