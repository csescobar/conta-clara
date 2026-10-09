// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { baseTokens, contrastPairs, stateNames, stateParts } from './design-tokens';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/design-system.md', import.meta.url), 'utf8');

/** Tokens declarados no primeiro bloco `:root` (tema claro). */
function lightTokens(): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map((match) => [match[1], match[2].toUpperCase()]));
}

const tokens = lightTokens();

describe('color tokens', () => {
  it('declares every base and state token as a hex color', () => {
    const expected = [
      ...baseTokens,
      'destructive-foreground',
      ...stateNames.flatMap((state) => stateParts.map((part) => `${state}${part}`)),
    ];
    expect(expected.filter((name) => !tokens[name])).toEqual([]);
  });

  it.each(contrastPairs)('keeps $label at $minimum:1 or more ($kind)', ({ foreground, background, minimum }) => {
    expect(contrastRatio(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(minimum);
  });

  it('accepts the short hex form the minified build produces', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    expect(() => contrastRatio('rgb(0 0 0)', '#fff')).toThrow(RangeError);
  });

  it('fails when a pair drops below its minimum', () => {
    expect(contrastRatio('#B9CBC6', '#FFFFFF')).toBeLessThan(3);
    expect(contrastRatio('#173C3A', '#FFFFFF')).toBeGreaterThan(11);
  });
});

describe('design system documentation', () => {
  const documented: Array<[string, string]> = [
    ['Fundo', 'background'],
    ['Texto principal', 'foreground'],
    ['Texto secundário', 'muted-foreground'],
    ['Superfície', 'card'],
    ['Ação primária', 'primary'],
    ['Seleção suave', 'accent'],
    ['Borda', 'border'],
    ['Borda de campo', 'input'],
    ['Sucesso', 'success'],
    ['Atenção', 'warning'],
    ['Erro', 'destructive'],
    ['Informação', 'info'],
    ['Realizado em gráficos', 'chart-realized'],
  ];

  it.each(documented)('lists the current value of %s', (label, token) => {
    const row = docs.split('\n').find((line) => line.startsWith(`| ${label} |`));
    expect(row, `linha "${label}" ausente em docs/design-system.md`).toBeDefined();
    expect(row).toContain(`\`${tokens[token]}\``);
  });

  it.each(stateNames)('lists the %s state palette', (state) => {
    const row = docs.split('\n').find((line) => line.startsWith(`| \`${state}\` |`));
    expect(row, `linha do estado ${state} ausente`).toBeDefined();
    for (const part of stateParts) expect(row).toContain(`\`${tokens[`${state}${part}`]}\``);
  });
});
