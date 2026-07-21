// webview/src/__tests__/AttachMenu.test.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { fireEvent, render, screen } from '@testing-library/react';
import { AttachMenu } from '../components/AttachMenu';

describe('AttachMenu', () => {
  it('renders all implemented categories', () => {
    render(<AttachMenu onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText('Files & Folders')).toBeInTheDocument();
    expect(screen.getByText('Instructions')).toBeInTheDocument();
    expect(screen.getByText('Source Control')).toBeInTheDocument();
    expect(screen.getByText('Problems')).toBeInTheDocument();
    expect(screen.getByText('Symbols')).toBeInTheDocument();
  });

  it('calls onSelect with the category id and closes on click', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();
    render(<AttachMenu onSelect={onSelect} onClose={onClose} />);
    fireEvent.click(screen.getByText('Files & Folders'));
    expect(onSelect).toHaveBeenCalledWith('files');
    expect(onClose).toHaveBeenCalled();
  });

  it('maps each label to its category id', () => {
    const onSelect = jest.fn();
    render(<AttachMenu onSelect={onSelect} onClose={jest.fn()} />);
    fireEvent.click(screen.getByText('Problems'));
    expect(onSelect).toHaveBeenCalledWith('problems');
    fireEvent.click(screen.getByText('Symbols'));
    expect(onSelect).toHaveBeenCalledWith('symbols');
    fireEvent.click(screen.getByText('Instructions'));
    expect(onSelect).toHaveBeenCalledWith('instructions');
    fireEvent.click(screen.getByText('Source Control'));
    expect(onSelect).toHaveBeenCalledWith('scm');
  });
});
