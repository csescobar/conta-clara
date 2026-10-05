import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('initial app screen', () => {
  it('shows the product name and explains the current setup state', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Conta Clara' })).toBeInTheDocument();
    expect(screen.getByText(/estrutura inicial está pronta/i)).toBeInTheDocument();
  });
});
