/** Cálculo de contraste WCAG 2.x entre cores hexadecimais (#rrggbb). */

function channel(value: number) {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  // O build minifica o CSS e pode reduzir #ffffff a #fff.
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new RangeError(`Cor inválida: ${hex}`);
  const full = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
  const [red, green, blue] = [0, 2, 4].map((offset) => channel(parseInt(full.slice(offset, offset + 2), 16)));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
