// webview/src/__tests__/EmptyState.test.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { render, screen } from '@testing-library/react';
import { EmptyState } from '../components/EmptyState';

// Welcome state controlled by tests
let mockWelcomeState: {
  version?: string;
  model?: string;
  modelProvider?: string;
  integrations?: Array<{
    name: string;
    state: 'connected' | 'unauthenticated' | 'unavailable';
    hint?: string;
  }>;
} = {};

jest.mock('../main', () => ({
  subscribeWelcome: jest.fn((_fn: () => void) => {
    // Return an unsubscribe no-op
    return jest.fn();
  }),
  getWelcomeState: jest.fn(() => mockWelcomeState),
}));

// Mock CSS import in main.tsx indirectly — main is fully mocked so no CSS issues

describe('EmptyState component', () => {
  beforeEach(() => {
    mockWelcomeState = {};
    // Reset mock implementations to return current mockWelcomeState
    const { getWelcomeState } = jest.requireMock('../main') as {
      getWelcomeState: jest.Mock;
      subscribeWelcome: jest.Mock;
    };
    getWelcomeState.mockImplementation(() => mockWelcomeState);
  });

  it('renders "xcsh" when no version provided', () => {
    mockWelcomeState = {};
    render(<EmptyState />);
    expect(screen.getByText('xcsh')).toBeInTheDocument();
  });

  it('renders version text when version is provided', () => {
    mockWelcomeState = { version: '1.2.3' };
    render(<EmptyState />);
    expect(screen.getByText('xcsh 1.2.3')).toBeInTheDocument();
  });

  it('renders model provider section when modelProvider is set', () => {
    mockWelcomeState = { modelProvider: 'Anthropic Claude' };
    render(<EmptyState />);
    expect(screen.getByText('Model Provider')).toBeInTheDocument();
    expect(screen.getByText('Anthropic Claude')).toBeInTheDocument();
  });

  it('does not render model provider section when modelProvider is absent', () => {
    mockWelcomeState = {};
    render(<EmptyState />);
    expect(screen.queryByText('Model Provider')).not.toBeInTheDocument();
  });

  it('renders connected integration with check icon class', () => {
    mockWelcomeState = {
      integrations: [{ name: 'Salesforce', state: 'connected' }],
    };
    render(<EmptyState />);
    expect(screen.getByText('Salesforce')).toBeInTheDocument();
    const checkSpan = screen.getByText('Salesforce').closest('.emptyStateCheck')?.querySelector('.checkIcon');
    expect(checkSpan).toHaveClass('connected');
  });

  it('renders unauthenticated integration with warning class and hint text', () => {
    mockWelcomeState = {
      integrations: [
        {
          name: 'GitHub',
          state: 'unauthenticated',
          hint: 'Run: gh auth login',
        },
      ],
    };
    render(<EmptyState />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Run: gh auth login')).toBeInTheDocument();
    const checkSpan = screen.getByText('GitHub').closest('.emptyStateCheck')?.querySelector('.checkIcon');
    expect(checkSpan).toHaveClass('unauthenticated');
  });

  it('renders unavailable integration with dash class', () => {
    mockWelcomeState = {
      integrations: [{ name: 'Jira', state: 'unavailable' }],
    };
    render(<EmptyState />);
    expect(screen.getByText('Jira')).toBeInTheDocument();
    const checkSpan = screen.getByText('Jira').closest('.emptyStateCheck')?.querySelector('.checkIcon');
    expect(checkSpan).toHaveClass('unavailable');
  });

  it('renders empty state when no integrations provided', () => {
    mockWelcomeState = { integrations: [] };
    render(<EmptyState />);
    // No integration list items — emptyStateSection from integrations block absent
    expect(screen.queryByText('Model Provider')).not.toBeInTheDocument();
    // Version still renders
    expect(screen.getByText('xcsh')).toBeInTheDocument();
  });

  it('handles mixed integration states', () => {
    mockWelcomeState = {
      integrations: [
        { name: 'ServiceA', state: 'connected' },
        { name: 'ServiceB', state: 'unauthenticated', hint: 'Please login' },
        { name: 'ServiceC', state: 'unavailable' },
      ],
    };
    render(<EmptyState />);
    expect(screen.getByText('ServiceA')).toBeInTheDocument();
    expect(screen.getByText('ServiceB')).toBeInTheDocument();
    expect(screen.getByText('ServiceC')).toBeInTheDocument();
    expect(screen.getByText('Please login')).toBeInTheDocument();

    const connectedSpan = screen.getByText('ServiceA').closest('.emptyStateCheck')?.querySelector('.checkIcon');
    expect(connectedSpan).toHaveClass('connected');

    const unauthSpan = screen.getByText('ServiceB').closest('.emptyStateCheck')?.querySelector('.checkIcon');
    expect(unauthSpan).toHaveClass('unauthenticated');

    const unavailSpan = screen.getByText('ServiceC').closest('.emptyStateCheck')?.querySelector('.checkIcon');
    expect(unavailSpan).toHaveClass('unavailable');
  });
});
