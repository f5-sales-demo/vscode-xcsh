// webview/src/__tests__/ToolsPickerMenu.test.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { fireEvent, render, screen } from '@testing-library/react';
import { ToolsPickerMenu } from '../components/ToolsPickerMenu';

const tools = [
  { name: 'vscode_read_file', label: 'Read File', description: 'Read a file' },
  { name: 'vscode_get_diagnostics', label: 'Get Diagnostics', description: 'Get diagnostics' },
];

describe('ToolsPickerMenu', () => {
  it('renders each tool label and description', () => {
    render(<ToolsPickerMenu tools={tools} onConfirm={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('Read File')).toBeInTheDocument();
    expect(screen.getByText('Get Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Read a file')).toBeInTheDocument();
  });

  it('confirms only the selected tool names and closes', () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    render(<ToolsPickerMenu tools={tools} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByText('Read File'));
    fireEvent.click(screen.getByRole('button', { name: /Attach/ }));
    expect(onConfirm).toHaveBeenCalledWith(['vscode_read_file']);
    expect(onClose).toHaveBeenCalled();
  });

  it('disables confirm when nothing is selected', () => {
    render(<ToolsPickerMenu tools={tools} onConfirm={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByRole('button', { name: /Attach/ })).toBeDisabled();
  });

  it('shows an empty state when there are no tools', () => {
    render(<ToolsPickerMenu tools={[]} onConfirm={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText(/No tools/)).toBeInTheDocument();
  });
});
