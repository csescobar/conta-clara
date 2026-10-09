import { expect, test } from './fixtures.js';
import { expectAccessible } from './accessibility.js';

// Este arquivo roda depois de first-release.spec.js (ordem alfabética), que já criou a conta e os dados fictícios.
async function waitForDashboard(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Visão geral', level: 1 })).toBeVisible();
  await expect(page.getByRole('status', { name: /^Carregando/ })).toHaveCount(0);
}

/** Soma dos deslocamentos de layout (CLS) desde a última chamada de `resetShifts`. */
async function observeLayoutShifts(page) {
  await page.evaluate(() => {
    window.__layoutShift = 0;
    if (window.__layoutShiftObserver) window.__layoutShiftObserver.disconnect();
    window.__layoutShiftObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShift += entry.value;
    });
    window.__layoutShiftObserver.observe({ type: 'layout-shift', buffered: false });
  });
}

const layoutShift = (page) => page.evaluate(() => window.__layoutShift);

for (const [name, viewport] of [
  ['celular 390 px', { width: 390, height: 844 }],
  ['desktop 1280 px', { width: 1280, height: 900 }],
]) {
  for (const [route, link, delayedApi, skeleton] of [
    ['lançamentos', 'Lançamentos', '**/api/entries?*', 'Carregando lançamentos'],
    ['painel', 'Visão geral', '**/api/dashboard?*', 'Carregando painel financeiro'],
  ]) {
    test(`${route} troca o esqueleto pelo conteúdo sem saltar o layout em ${name}`, async ({ signedInPage: page }) => {
      await page.setViewportSize(viewport);
      await waitForDashboard(page);
      // Atrasa só a API da tela para que o esqueleto fique visível e o conteúdo chegue depois.
      await page.route(delayedApi, async (request) => {
        await new Promise((resolve) => setTimeout(resolve, 900));
        await request.continue();
      });
      // Sai do painel para que a tela de destino carregue do zero.
      await page
        .getByRole('link', { name: route === 'painel' ? 'Lançamentos' : 'Visão geral' })
        .first()
        .click();
      await page.getByRole('link', { name: link }).first().click();
      await observeLayoutShifts(page);
      const loading = page.getByRole('status', { name: skeleton });
      await expect(loading).toBeVisible();
      await expect(loading).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(400);
      expect(await layoutShift(page), `deslocamento de layout acumulado em ${route} (${name})`).toBeLessThan(0.1);
    });
  }
}

test('o esqueleto de carregamento é acessível e a lista vazia orienta o que fazer', async ({ signedInPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForDashboard(page);
  let delayMs = 1500;
  await page.route('**/api/entries?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
  await page.getByRole('link', { name: 'Lançamentos' }).first().click();
  const loading = page.getByRole('status', { name: 'Carregando lançamentos' });
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expectAccessible(page, 'lançamentos carregando (esqueleto)');

  // Um mês sem lançamentos mostra orientação e a ação disponível.
  await expect(loading).toHaveCount(0, { timeout: 15_000 });
  delayMs = 0;
  await page.getByLabel('Competência').fill('01/2000');
  const empty = page.getByRole('status', { name: 'Nenhum lançamento encontrado' });
  await expect(empty).toBeVisible();
  await expect(empty.getByRole('link', { name: 'Adicionar lançamento' })).toBeVisible();
  await expectAccessible(page, 'lançamentos vazio');
});

test('o aviso após salvar não rouba o foco e fica disponível para leitores de tela', async ({ signedInPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForDashboard(page);
  await page.getByRole('link', { name: 'Lançamentos' }).first().click();
  await page.getByRole('link', { name: 'Adicionar lançamento' }).first().click();
  await page.getByLabel('Descrição').fill('Conta para aviso fictícia');
  await page.getByLabel('Valor previsto (R$)').fill('12,34');
  await page.getByRole('button', { name: 'Salvar lançamento' }).click();

  const notice = page.getByText('Lançamento salvo.', { exact: true });
  await expect(notice).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Lançamento salvo.' })).toHaveCount(1);
  // O foco permanece na página, não vai para o aviso.
  expect(await page.evaluate(() => document.activeElement?.closest('[data-radix-toast-viewport]') === null)).toBe(true);
  await expectAccessible(page, 'lista com aviso');
});
