/** Preferência de tema guardada neste aparelho (não é sincronizada com o servidor). */
export type ThemePreference = 'system' | 'light' | 'dark';

export const themePreferences: ReadonlyArray<readonly [ThemePreference, string]> = [
  ['system', 'Seguir o sistema'],
  ['light', 'Claro'],
  ['dark', 'Escuro'],
];

export const themeStorageKey = 'conta-clara-theme';

/** Cor da barra do navegador por tema (`<meta name="theme-color">`); o script em index.html usa os mesmos valores. */
export const themeColors = { light: '#1d6a61', dark: '#0e1918' } as const;

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(themeStorageKey);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/**
 * Aplica a preferência ao documento: `data-theme` só existe para escolhas explícitas; "sistema" deixa a
 * decisão para `prefers-color-scheme`. Também atualiza as cores da barra do navegador.
 */
export function applyThemePreference(preference: ThemePreference, root: HTMLElement = document.documentElement) {
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  const light = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][media*="light"]');
  const dark = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][media*="dark"]');
  if (light) light.content = themeColors[preference === 'dark' ? 'dark' : 'light'];
  if (dark) dark.content = themeColors[preference === 'light' ? 'light' : 'dark'];
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    if (preference === 'system') localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, preference);
  } catch {
    // Armazenamento bloqueado: a escolha vale só nesta sessão.
  }
}
