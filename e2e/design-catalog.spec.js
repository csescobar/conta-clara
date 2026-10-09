import { expect, test } from '@playwright/test';
import { expectAccessible } from './accessibility.js';

// O build de testes inclui o catálogo (VITE_DESIGN_CATALOG); o de produção não.
for (const [name, viewport] of [
  ['celular 320 px', { width: 320, height: 800 }],
  ['tablet 768 px', { width: 768, height: 900 }],
  ['desktop 1280 px', { width: 1280, height: 900 }],
]) {
  test(`catálogo do design system sem violações de acessibilidade e sem rolagem horizontal em ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/catalogo');
    await expect(page.getByRole('heading', { name: 'Catálogo do design system' })).toBeVisible();
    // Os valores e as razões de contraste são lidos do CSS depois da primeira renderização.
    await expect(page.getByRole('cell', { name: /✓/ }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: /✗/ })).toHaveCount(0);

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
    await expectAccessible(page, `catálogo (${name})`);
  });
}

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
