import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { themeStorageKey } from '../lib/theme';
import { AppearanceSettings } from './appearance-settings';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('appearance settings', () => {
  it('follows the system by default and explains that the choice stays on this device', () => {
    render(<AppearanceSettings />);

    expect(screen.getByRole('heading', { name: 'Aparência' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Seguir o sistema' })).toBeChecked();
    expect(screen.getByText(/somente neste aparelho/)).toBeInTheDocument();
  });

  it('applies and remembers the dark theme, then returns to the system', async () => {
    const user = userEvent.setup();
    render(<AppearanceSettings />);

    await user.click(screen.getByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem(themeStorageKey)).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'Claro' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    await user.click(screen.getByRole('radio', { name: 'Seguir o sistema' }));
    expect(document.documentElement).not.toHaveAttribute('data-theme');
    expect(localStorage.getItem(themeStorageKey)).toBeNull();
  });

  it('shows the saved choice when the page opens again, with keyboard selection', async () => {
    const user = userEvent.setup();
    localStorage.setItem(themeStorageKey, 'dark');
    render(<AppearanceSettings />);
    expect(screen.getByRole('radio', { name: 'Escuro' })).toBeChecked();

    screen.getByRole('radio', { name: 'Escuro' }).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Claro' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
});
