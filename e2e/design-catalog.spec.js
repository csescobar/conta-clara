import { expect, test } from '@playwright/test';
import { expectAccessible } from './accessibility.js';

// O build de testes inclui o catálogo (VITE_DESIGN_CATALOG); o de produção não.
const backgrounds = { light: 'rgb(245, 248, 247)', dark: 'rgb(14, 25, 24)' };

for (const colorScheme of ['light', 'dark']) {
  for (const [name, viewport] of [
    ['celular 320 px', { width: 320, height: 800 }],
    ['tablet 768 px', { width: 768, height: 900 }],
    ['desktop 1280 px', { width: 1280, height: 900 }],
  ]) {
    test(`catálogo no tema ${colorScheme} sem violações de acessibilidade e sem rolagem horizontal em ${name}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize(viewport);
      await page.goto('/catalogo');
      await expect(page.getByRole('heading', { name: 'Catálogo do design system', level: 1 })).toBeVisible();
      // Os valores e as razões de contraste são lidos do CSS depois da primeira renderização.
      await expect(page.getByRole('cell', { name: /✓/ }).first()).toBeVisible();
      await expect(page.getByRole('cell', { name: /✗/ })).toHaveCount(0);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds[colorScheme]);

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      // Tabela que transborda vira região rolável alcançável pelo teclado; sem transbordo não cria parada de Tab.
      const region = page.getByRole('region', { name: 'Razão de contraste por par de tokens' });
      if (viewport.width < 600) {
        await expect(region).toHaveAttribute('tabindex', '0');
        await region.focus();
        await expect(region).toBeFocused();
      } else {
        await expect(region).toHaveCount(0);
      }
      await expectAccessible(page, `catálogo (${colorScheme}, ${name})`);
    });
  }
}

test('a escolha de tema pela interface vale na hora, sobrevive ao recarregamento e vence o sistema', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/catalogo');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  await expect(page.getByRole('radio', { name: 'Seguir o sistema' })).toBeChecked();

  await page.getByRole('radio', { name: 'Escuro' }).check({ force: true });
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds.dark);
  await expect(page.locator('meta[name="theme-color"][media*="light"]')).toHaveAttribute('content', '#0e1918');
  await expectAccessible(page, 'catálogo (escolha escura sobre sistema claro)');

  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('radio', { name: 'Escuro' })).toBeChecked();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds.dark);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('radio', { name: 'Claro' }).check({ force: true });
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds.light);

  await page.getByRole('radio', { name: 'Seguir o sistema' }).check({ force: true });
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(backgrounds.dark);
  await expect(page.locator('meta[name="theme-color"][media*="light"]')).toHaveAttribute('content', '#1d6a61');
});

test('diálogo de confirmação do catálogo é acessível e devolve o foco', async ({ page }) => {
  await page.goto('/catalogo');
  const trigger = page.getByRole('button', { name: 'Pedir confirmação' });
  await trigger.click();
  const dialog = page.getByRole('alertdialog', { name: 'Excluir “Conta fictícia”?' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'diálogo de confirmação do catálogo');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
