import { expect, test } from '@playwright/test';
import { fixedNow, sessionPath } from './seed.js';

// Captura cada rota principal em três larguras e nos dois temas, com dados fictícios determinísticos (ver seed.js) e
// relógio fixo em 15/06/2099. Mudança visual não intencional faz `toHaveScreenshot` falhar e anexar a imagem da diferença.
// Para aceitar uma mudança intencional, consulte "Regressão visual" em docs/design-system.md.
const routes = [
  ['painel', '/', 'Visão geral'],
  ['lancamentos', '/lancamentos', 'Lançamentos'],
  ['novo-lancamento', '/lancamentos/novo', 'Adicionar lançamento'],
  ['compras', '/compras', 'Compras parceladas'],
  ['faturas', '/faturas', 'Faturas'],
  ['recorrencias', '/recorrencias', 'Recorrências'],
  ['nova-regra', '/recorrencias/novo', 'Nova regra mensal'],
  ['historico', '/historico', 'Histórico'],
  ['configuracoes', '/configuracoes', 'Configurações'],
  ['importar', '/importar', 'Importar planilha'],
];
const themes = [
  ['claro', 'light'],
  ['escuro', 'dark'],
];
const widths = [360, 768, 1280];

async function waitUntilSettled(page, name) {
  await expect(page.getByRole('status', { name: /^Carregando/ })).toHaveCount(0);
  if (name === 'painel') {
    await expect(page.getByRole('heading', { name: 'Previsto versus realizado' })).toBeVisible();
    await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible();
  }
  await expect(page.getByText(/^Rede conectada/)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

for (const [themeName, colorScheme] of themes) {
  for (const width of widths) {
    for (const [name, path, heading] of routes) {
      test(`${name} no tema ${themeName} em ${width} px`, async ({ browser }) => {
        const context = await browser.newContext({
          storageState: sessionPath,
          viewport: { width, height: 900 },
          colorScheme,
          reducedMotion: 'reduce',
          locale: 'pt-BR',
          timezoneId: 'America/Sao_Paulo',
        });
        const page = await context.newPage();
        try {
          await page.clock.setFixedTime(fixedNow);
          await page.goto(path);
          await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
          await waitUntilSettled(page, name);
          // Horários do servidor (histórico) mudam a cada execução e ficam de fora da comparação.
          await expect(page).toHaveScreenshot(`${name}-${themeName}-${width}.png`, { fullPage: true, mask: [page.locator('main time')] });
        } finally {
          await context.close();
        }
      });
    }
  }
}
