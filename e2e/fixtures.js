import { expect, test as base } from '@playwright/test';

// A API limita as tentativas de login (10 por 15 minutos). Estes testes entram uma única vez e reaproveitam a sessão.
const email = 'admin@example.test';
const password = 'senha-ficticia-admin-2026';
let cachedState;

async function loadSession(browser) {
  if (cachedState) return cachedState;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Visão geral', level: 1 })).toBeVisible();
  cachedState = await context.storageState();
  await context.close();
  return cachedState;
}

/** `signedInPage`: página já autenticada como a administradora fictícia criada em first-release.spec.js. */
export const test = base.extend({
  signedInPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: await loadSession(browser) });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { expect };
