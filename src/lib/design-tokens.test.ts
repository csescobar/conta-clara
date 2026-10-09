// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { baseTokens, contrastPairs, stateNames, stateParts } from './design-tokens';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../../docs/design-system.md', import.meta.url), 'utf8');

function parseBlock(source: string, selector: RegExp): Record<string, string> {
  const block = selector.exec(source)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map((match) => [match[1], match[2].toUpperCase()]));
}

/** Tema claro (primeiro bloco `:root`), tema escuro pelo sistema e tema escuro escolhido pela pessoa. */
const palettes = {
  claro: parseBlock(css, /:root\s*\{([^}]*)\}/),
  'escuro (sistema)': parseBlock(css, /:root:not\(\[data-theme='light'\]\)\s*\{([^}]*)\}/),
  'escuro (escolhido)': parseBlock(css, /:root\[data-theme='dark'\]\s*\{([^}]*)\}/),
};
const tokens = palettes.claro;
const darkTokens = palettes['escuro (escolhido)'];
const allTokenNames = [
  ...baseTokens,
  'destructive-foreground',
  'scrim',
  ...stateNames.flatMap((state) => stateParts.map((part) => `${state}${part}`)),
];

describe('color tokens', () => {
  it.each(Object.entries(palettes))('declares every base and state token in the %s theme', (_name, palette) => {
    expect(allTokenNames.filter((name) => !palette[name])).toEqual([]);
  });

  it('keeps the system dark palette identical to the explicitly chosen one', () => {
    expect(palettes['escuro (sistema)']).toEqual(palettes['escuro (escolhido)']);
  });

  it.each(Object.entries(palettes))('keeps every pair above its minimum contrast in the %s theme', (_name, palette) => {
    const failing = contrastPairs
      .map((pair) => ({ ...pair, ratio: contrastRatio(palette[pair.foreground], palette[pair.background]) }))
      .filter((pair) => pair.ratio < pair.minimum)
      .map((pair) => `${pair.label}: ${pair.ratio.toFixed(2)}:1 < ${pair.minimum}:1 (${pair.kind})`);
    expect(failing).toEqual([]);
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

describe('dark theme documentation', () => {
  it.each(allTokenNames)('lists --%s with its light and dark values', (token) => {
    const row = docs.split('\n').find((line) => line.startsWith(`| \`--${token}\` |`));
    expect(row, `linha de --${token} ausente na tabela do tema escuro`).toBeDefined();
    expect(row).toContain(`\`${tokens[token]}\``);
    expect(row).toContain(`\`${darkTokens[token]}\``);
  });
});
