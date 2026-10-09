/** Tokens de cor de `src/styles.css` e os pares que precisam manter contraste mínimo (WCAG 2.2 AA). */

export const baseTokens = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'border',
  'input',
  'ring',
  'chart-realized',
] as const;

export const stateNames = ['success', 'warning', 'destructive', 'info'] as const;
export type StateName = (typeof stateNames)[number];
export const stateParts = ['', '-soft', '-surface', '-border'] as const;

export type ContrastPair = { foreground: string; background: string; minimum: number; kind: 'texto' | 'componente'; label: string };

const text = (foreground: string, background: string): ContrastPair => ({
  foreground,
  background,
  minimum: 4.5,
  kind: 'texto',
  label: `${foreground} sobre ${background}`,
});
const component = (foreground: string, background: string): ContrastPair => ({
  foreground,
  background,
  minimum: 3,
  kind: 'componente',
  label: `${foreground} sobre ${background}`,
});

export const contrastPairs: ContrastPair[] = [
  text('foreground', 'background'),
  text('foreground', 'card'),
  text('muted-foreground', 'background'),
  text('muted-foreground', 'card'),
  text('muted-foreground', 'muted'),
  text('primary', 'card'),
  text('primary', 'background'),
  text('primary-foreground', 'primary'),
  text('secondary-foreground', 'secondary'),
  text('accent-foreground', 'accent'),
  text('destructive-foreground', 'destructive'),
  ...stateNames.flatMap((state) => [
    text(state, `${state}-soft`),
    text(state, `${state}-surface`),
    text(state, 'card'),
    text(state, 'background'),
    text('foreground', `${state}-surface`),
    text('muted-foreground', `${state}-surface`),
  ]),
  component('input', 'card'),
  component('input', 'background'),
  component('ring', 'card'),
  component('ring', 'background'),
  component('chart-realized', 'card'),
  component('primary', 'card'),
];
