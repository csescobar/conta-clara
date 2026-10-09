import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * Executa o axe (incluindo contraste de cores, que só funciona num navegador de verdade) e falha com a
 * lista de violações. `serious` e `critical` sempre falham; as demais também, para manter a regra simples.
 */
export async function expectAccessible(page, name, { exclude = [] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(tags);
  for (const selector of exclude) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const summary = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n    ${violation.nodes
        .slice(0, 4)
        .map((node) => node.target.join(' '))
        .join('\n    ')}`,
  );
  expect(summary, `Violações de acessibilidade em ${name}`).toEqual([]);
}
