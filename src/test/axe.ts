import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Executa o axe sobre um elemento e falha listando as violações. O jsdom não calcula estilos
 * visuais, então o contraste fica a cargo do teste de tokens e do Playwright.
 */
export async function expectNoAccessibilityViolations(root: Element = document.body, options: { region?: boolean } = {}) {
  const results = await axe.run(root, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false }, region: { enabled: options.region ?? false } },
    resultTypes: ['violations'],
  });
  expect(
    results.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
    ),
  ).toEqual([]);
}
