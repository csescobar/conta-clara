import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyThemePreference, readThemePreference, saveThemePreference, themeColors, themeStorageKey } from './theme';

function addThemeColorMetas() {
  document.head.innerHTML =
    '<meta name="theme-color" content="#1d6a61" media="(prefers-color-scheme: light)">' +
    '<meta name="theme-color" content="#0e1918" media="(prefers-color-scheme: dark)">';
  return {
    light: document.querySelector<HTMLMetaElement>('meta[media*="light"]')!,
    dark: document.querySelector<HTMLMetaElement>('meta[media*="dark"]')!,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = '';
});

describe('theme preference', () => {
  it('defaults to following the system and ignores unknown stored values', () => {
    expect(readThemePreference()).toBe('system');
    localStorage.setItem(themeStorageKey, 'sepia');
    expect(readThemePreference()).toBe('system');
    localStorage.setItem(themeStorageKey, 'dark');
    expect(readThemePreference()).toBe('dark');
  });

  it('stores explicit choices and removes the entry when following the system', () => {
    saveThemePreference('dark');
    expect(localStorage.getItem(themeStorageKey)).toBe('dark');
    saveThemePreference('system');
    expect(localStorage.getItem(themeStorageKey)).toBeNull();
  });

  it('keeps working when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readThemePreference()).toBe('system');
    expect(() => saveThemePreference('dark')).not.toThrow();
  });

  it('marks the document only for explicit choices and keeps the browser bar color in step', () => {
    const { light, dark } = addThemeColorMetas();

    applyThemePreference('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect([light.content, dark.content]).toEqual([themeColors.dark, themeColors.dark]);

    applyThemePreference('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect([light.content, dark.content]).toEqual([themeColors.light, themeColors.light]);

    applyThemePreference('system');
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect([light.content, dark.content]).toEqual([themeColors.light, themeColors.dark]);
  });

  it('uses in index.html the same storage key and colors as the app', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain(`localStorage.getItem('${themeStorageKey}')`);
    expect(html).toContain(`light: '${themeColors.light}'`);
    expect(html).toContain(`dark: '${themeColors.dark}'`);
    expect(html).toContain(`content="${themeColors.light}" media="(prefers-color-scheme: light)"`);
    expect(html).toContain(`content="${themeColors.dark}" media="(prefers-color-scheme: dark)"`);
  });
});
