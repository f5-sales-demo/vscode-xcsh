// webview/src/__tests__/ComposerHost.test.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// Proves the shared `@f5-sales-demo/xcsh-chat-ui` Composer renders under React
// and that the ComposerHost wiring (protocol ↔ shared Composer props) works.
// The DOM here is the SHARED Composer's, not the retired bespoke InputBar.

import { act, fireEvent, render, screen } from '@testing-library/react';
import { ComposerHost } from '../components/ComposerHost';
import type { Attachment } from '../vendored/chat-ui';

const mockState: { listeners: Record<string, (msg: Record<string, unknown>) => void> } = { listeners: {} };
const mockSendRequestAttachment = jest.fn();
const mockSendReady = jest.fn();
const mockSendSetMode = jest.fn();
const mockSendSetThinking = jest.fn();

jest.mock('../lib/protocol', () => ({
  on: (type: string, cb: (msg: Record<string, unknown>) => void) => {
    mockState.listeners[type] = cb;
    return () => {
      delete mockState.listeners[type];
    };
  },
  sendReady: () => mockSendReady(),
  sendRequestAttachment: (category: string) => mockSendRequestAttachment(category),
  sendSetMode: (mode: string) => mockSendSetMode(mode),
  sendSetThinking: (level: string) => mockSendSetThinking(level),
}));

function emit(attachment: Attachment): void {
  act(() => {
    mockState.listeners.attachment_added?.({ type: 'attachment_added', attachment });
  });
}

function file(id: string, label: string, content = 'X'): Attachment {
  return { id, kind: 'file', label, dedupKey: `file:${label}`, content, path: label };
}

function getEditor(): HTMLElement {
  return screen.getByRole('textbox', { name: 'Message input' });
}

function type(text: string): void {
  const editor = getEditor();
  editor.textContent = text;
  fireEvent.input(editor);
}

beforeEach(() => {
  mockSendRequestAttachment.mockClear();
  mockSendReady.mockClear();
  mockSendSetMode.mockClear();
  mockSendSetThinking.mockClear();
  mockState.listeners = {};
});

describe('ComposerHost (shared Composer wiring)', () => {
  it('renders the shared editor and send button', () => {
    render(<ComposerHost onSubmit={jest.fn()} onInterrupt={jest.fn()} busy={false} />);
    expect(getEditor()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    expect(mockSendReady).toHaveBeenCalled();
  });

  it('submits the trimmed typed text and clears the editor', () => {
    const onSubmit = jest.fn();
    render(<ComposerHost onSubmit={onSubmit} onInterrupt={jest.fn()} busy={false} />);
    type('  what is this?  ');
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSubmit).toHaveBeenCalledWith('what is this?');
    expect(getEditor().textContent).toBe('');
  });

  it('adds a chip when an attachment_added protocol message arrives', () => {
    render(<ComposerHost onSubmit={jest.fn()} onInterrupt={jest.fn()} busy={false} />);
    emit(file('1', 'a.ts', 'hello'));
    expect(screen.getByText('a.ts')).toBeInTheDocument();
  });

  it('requests the "files" category when Files & Folders is picked', () => {
    render(<ComposerHost onSubmit={jest.fn()} onInterrupt={jest.fn()} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /add context/i }));
    fireEvent.click(screen.getByText('Files & Folders'));
    expect(mockSendRequestAttachment).toHaveBeenCalledWith('files');
  });

  it('submits the selected slash command as the prompt', () => {
    const onSubmit = jest.fn();
    render(<ComposerHost onSubmit={onSubmit} onInterrupt={jest.fn()} busy={false} />);
    fireEvent.click(screen.getByRole('button', { name: /slash commands/i }));
    fireEvent.click(screen.getByText('/status'));
    expect(onSubmit).toHaveBeenCalledWith('/status');
  });
});
