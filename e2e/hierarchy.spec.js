import { expect, test } from './fixtures.js';
import { expectAccessible } from './accessibility.js';

// Roda depois de first-release.spec.js (ordem alfabética), que já criou a conta e lançamentos pendentes, pagos e parcelas.
async function waitForDashboard(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Visão geral', level: 1 })).toBeVisible();
  await expect(page.getByRole('status', { name: /^Carregando/ })).toHaveCount(0);
}

async function openEntries(page) {
  await page.getByRole('link', { name: 'Lançamentos' }).first().click();
  await expect(page.getByRole('heading', { name: 'Lançamentos', level: 1 })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Carregando lançamentos' })).toHaveCount(0);
  await expect(page.getByRole('listitem').first()).toBeVisible();
}

/** Número de linhas visuais de texto de cada linha da lista (agrupando posições verticais próximas). */
function visualLineCounts(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('main section[aria-labelledby^="entries-due-"] li')].map((item) => {
      const fragments = [];
      const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects())
          if (rect.width > 0 && rect.height > 0) fragments.push({ top: rect.top, text: node.textContent.trim().slice(0, 24) });
      }
      const lines = [];
      for (const fragment of fragments.sort((a, b) => a.top - b.top)) {
        if (!lines.length || fragment.top - lines.at(-1).top > 6) lines.push({ top: fragment.top, texts: [fragment.text] });
        else lines.at(-1).texts.push(fragment.text);
      }
      return {
        text: item.querySelector('p')?.textContent ?? '',
        lines: lines.length,
        detail: lines.map((line) => line.texts.join(' | ')).join('  //  '),
      };
    }),
  );
}

for (const width of [320, 360, 390, 430]) {
  test(`lançamentos em ${width} px: grupos por vencimento, linhas enxutas, ações no menu e sem rolagem horizontal`, async ({
    signedInPage: page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await waitForDashboard(page);
    await openEntries(page);

    const overflowing = await page.evaluate(
      (limit) =>
        [...document.querySelectorAll('main *')]
          .filter((element) => element.getBoundingClientRect().right > limit + 0.5)
          .slice(0, 5)
          .map(
            (element) =>
              `${element.tagName}.${String(element.className).slice(0, 60)} ${Math.round(element.getBoundingClientRect().right)}`,
          ),
      width,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `elementos que passam da largura: ${overflowing.join(' ; ')}`,
    ).toBeLessThanOrEqual(width);
    const groupHeadings = await page.locator('main section[aria-labelledby^="entries-due-"] h3').allTextContents();
    expect(groupHeadings.length).toBeGreaterThan(0);
    for (const heading of groupHeadings)
      expect(heading).toMatch(
        /^(Segunda|Terça|Quarta|Quinta|Sexta)-feira, \d{2}\/\d{2}\/\d{4}$|^(Sábado|Domingo), \d{2}\/\d{2}\/\d{4}$|^Sem vencimento$/,
      );

    if (width === 360) {
      const rows = await visualLineCounts(page);
      expect(rows.length).toBeGreaterThan(2);
      for (const row of rows) expect(row.lines, `linhas visuais de "${row.text}" em 360 px: ${row.detail}`).toBeLessThanOrEqual(3);
    }

    // As ações secundárias saem da linha e ficam no menu; nenhuma foi removida.
    await expect(page.getByRole('button', { name: /^Excluir / })).toHaveCount(0);
    const trigger = page.getByRole('button', { name: /^Mais ações para / }).first();
    await expect(trigger).toBeVisible();
    const box = await trigger.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox.x).toBeGreaterThanOrEqual(0);
    expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test('o menu de ações funciona só com o teclado e leva a Editar e Excluir', async ({ signedInPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForDashboard(page);
  await openEntries(page);

  const trigger = page.getByRole('button', { name: /^Mais ações para / }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const items = await menu.getByRole('menuitem').allTextContents();
  expect(items).toEqual(expect.arrayContaining(['Editar']));
  // Com o menu modal aberto, o restante da página fica oculto; verifica o próprio menu.
  await expectAccessible(page, 'menu de ações aberto', { include: ['[role="menu"]'] });
  await page.keyboard.press('Escape');

  // Abre a confirmação de exclusão pelo teclado e cancela: o foco volta para o botão do menu.
  await trigger.focus();
  await page.keyboard.press('Enter');
  await menu.getByRole('menuitem', { name: 'Excluir' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('no desktop as ações continuam em linha e o menu de reticências não aparece', async ({ signedInPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await waitForDashboard(page);
  await openEntries(page);

  await expect(page.getByRole('button', { name: /^Mais ações para / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Excluir / }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /^Editar / }).first()).toBeVisible();
});

for (const width of [320, 390, 430]) {
  test(`painel em ${width} px: indicadores compactos antes da tabela e dos gráficos, sem rolagem horizontal`, async ({
    signedInPage: page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await waitForDashboard(page);
    await expect(page.getByRole('heading', { name: 'Previsto versus realizado' })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const summary = page.getByRole('region', { name: /^Resumo de / });
    const table = page.getByRole('table', { name: /Valores previstos e realizados/ });
    const charts = page.getByRole('heading', { name: 'Previsto versus realizado' });
    const [summaryBox, tableBox, chartsBox] = await Promise.all([summary.boundingBox(), table.boundingBox(), charts.boundingBox()]);
    expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(tableBox.y);
    expect(tableBox.y).toBeLessThan(chartsBox.y);
    // Quatro indicadores em linhas compactas: bem abaixo de quatro cartões verticais.
    expect(summaryBox.height).toBeLessThan(width < 400 ? 480 : 400);
    await expectAccessible(page, `painel (${width} px)`);
  });
}
