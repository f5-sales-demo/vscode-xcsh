// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
// webview/src/__tests__/SlashCommandMenu.test.tsx

import { fireEvent, render, screen } from '@testing-library/react';
import { SlashCommandMenu } from '../components/SlashCommandMenu';

describe('SlashCommandMenu', () => {
  it('renders all three commands', () => {
    render(<SlashCommandMenu onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('/status')).toBeInTheDocument();
    expect(screen.getByText('/context')).toBeInTheDocument();
    expect(screen.getByText('/resources')).toBeInTheDocument();
  });

  it('calls onSelect with command when clicked', () => {
    const onSelect = jest.fn();
    render(<SlashCommandMenu onSelect={onSelect} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('/status'));
    expect(onSelect).toHaveBeenCalledWith('/status');
  });

  it('shows descriptions for each command', () => {
    render(<SlashCommandMenu onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('Show integration health')).toBeInTheDocument();
    expect(screen.getByText('Show active xcsh context')).toBeInTheDocument();
    expect(screen.getByText('Browse current namespace')).toBeInTheDocument();
  });
});
