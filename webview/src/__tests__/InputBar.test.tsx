// webview/src/__tests__/InputBar.test.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { InputBar } from '../components/InputBar';
import type { Attachment } from '../lib/attachmentTypes';
import { createNewSession } from '../state/sessions';

const mockState: { listeners: Record<string, (msg: Record<string, unknown>) => void> } = { listeners: {} };
const mockSendRequestAttachment = jest.fn();

jest.mock('../lib/protocol', () => ({
  on: (type: string, cb: (msg: Record<string, unknown>) => void) => {
    mockState.listeners[type] = cb;
    return () => {
      delete mockState.listeners[type];
    };
  },
  sendReady: jest.fn(),
  sendRequestAttachment: (category: string) => mockSendRequestAttachment(category),
  sendSetMode: jest.fn(),
  sendSetThinking: jest.fn(),
}));

function emit(attachment: Attachment): void {
  act(() => {
    mockState.listeners.attachment_added?.({ type: 'attachment_added', attachment });
  });
}

function emitTools(tools: Array<{ name: string; label: string; description: string }>): void {
  act(() => {
    mockState.listeners.tools_available?.({ type: 'tools_available', tools });
  });
}

function file(id: string, label: string, content = 'X'): Attachment {
  return { id, kind: 'file', label, dedupKey: `file:${label}`, content, path: label };
}

beforeEach(() => {
  mockSendRequestAttachment.mockClear();
  mockState.listeners = {};
});

describe('InputBar attachment picker', () => {
  it('opens the category menu and requests the chosen category', () => {
    render(<InputBar onSubmit={jest.fn()} onInterrupt={jest.fn()} busy={false} />);
    fireEvent.click(screen.getByTitle('Add context'));
    expect(screen.getByText('Files & Folders')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Problems'));
    expect(mockSendRequestAttachment).toHaveBeenCalledWith('problems');
  });

  it('renders a chip per attachment and de-dupes by dedupKey', () => {
    render(<InputBar onSubmit={jest.fn()} onInterrupt={jest.fn()} busy={false} />);
    emit(file('1', 'a.ts'));
    emit(file('2', 'b.ts'));
    emit(file('3', 'a.ts')); // duplicate dedupKey → ignored
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('b.ts')).toBeInTheDocument();
    expect(screen.getAllByText('file')).toHaveLength(2);
  });

  it('removes a chip when its × is clicked', () => {
    render(<InputBar onSubmit={jest.fn()} onInterrupt={jest.fn()} busy={false} />);
    emit(file('1', 'a.ts'));
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Remove'));
    expect(screen.queryByText('a.ts')).not.toBeInTheDocument();
  });

  it('prepends serialized attachments to the submitted prompt', () => {
    const onSubmit = jest.fn();
    render(<InputBar onSubmit={onSubmit} onInterrupt={jest.fn()} busy={false} />);
    emit(file('1', 'a.ts', 'hello'));
    const editor = screen.getByRole('textbox');
    editor.textContent = 'what is this?';
    fireEvent.input(editor);
    fireEvent.click(screen.getByTitle('Send (Enter)'));
    expect(onSubmit).toHaveBeenCalledWith('[File: a.ts]\n\nhello\n\nwhat is this?');
  });

  it('allows submitting an attachment with no typed text', () => {
    const onSubmit = jest.fn();
    render(<InputBar onSubmit={onSubmit} onInterrupt={jest.fn()} busy={false} />);
    emit(file('1', 'a.ts', 'hello'));
    fireEvent.click(screen.getByTitle('Send (Enter)'));
    expect(onSubmit).toHaveBeenCalledWith('[File: a.ts]\n\nhello');
  });

  it('opens the tools picker and attaches the selected tools', () => {
    render(<InputBar onSubmit={jest.fn()} onInterrupt={jest.fn()} busy={false} />);
    emitTools([{ name: 'vscode_read_file', label: 'Read File', description: 'Read a file' }]);
    fireEvent.click(screen.getByTitle('Add context'));
    fireEvent.click(screen.getByText('Tools'));
    fireEvent.click(screen.getByText('Read File'));
    fireEvent.click(screen.getByRole('button', { name: /Attach/ }));
    expect(screen.getByText('tools')).toBeInTheDocument(); // chip kind
    expect(screen.getByText('1 tool')).toBeInTheDocument();
  });

  it('attaches the active session transcript', () => {
    const session = createNewSession();
    session.addUserMessage('hello there');
    render(<InputBar onSubmit={jest.fn()} onInterrupt={jest.fn()} busy={false} />);
    fireEvent.click(screen.getByTitle('Add context'));
    fireEvent.click(screen.getByText('Sessions'));
    expect(screen.getByText('sessions')).toBeInTheDocument(); // chip kind
    expect(screen.getByText(/Session:/)).toBeInTheDocument();
  });
});
