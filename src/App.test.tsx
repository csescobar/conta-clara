import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('initial app screen', () => {
  it('shows the design preview with fictional financial examples', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Finanças com mais clareza.' })).toBeInTheDocument();
    expect(screen.getByText(/4\.285,90/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ação principal' })).toBeInTheDocument();
  });
});
