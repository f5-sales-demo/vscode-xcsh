// webview/src/__tests__/EmptyState.test.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { render, screen } from '@testing-library/react';
import { EmptyState } from '../components/EmptyState';

describe('EmptyState component', () => {
  it('renders the static "xcsh" frame title', () => {
    render(<EmptyState />);
    expect(screen.getByText('xcsh')).toBeInTheDocument();
  });

  it('renders the F5 logo', () => {
    render(<EmptyState />);
    expect(screen.getByRole('img', { name: 'F5 logo' })).toBeInTheDocument();
  });

  it('renders no dynamic model-provider or integration content', () => {
    render(<EmptyState />);
    expect(screen.queryByText('Model Provider')).not.toBeInTheDocument();
    expect(document.querySelector('.emptyStateCheck')).toBeNull();
    expect(document.querySelector('.welcomeRight')).toBeNull();
  });
});
