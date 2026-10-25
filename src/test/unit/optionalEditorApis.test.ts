// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import * as vscode from 'vscode';
import type { ContextManagerInterface } from '../../config/contextTypes';
import { registerChatParticipant } from '../../xcsh/chatParticipant';
import { registerLanguageModelProvider } from '../../xcsh/languageModelProvider';
import { registerLanguageModelTools } from '../../xcsh/languageModelTools';
import type { XcshRpcBridge } from '../../xcsh/rpcBridge';

jest.mock('vscode', () => ({ __esModule: true, ...jest.requireActual('../__mocks__/vscode') }));
const editor = jest.requireMock<{ lm: typeof vscode.lm | undefined; chat: typeof vscode.chat | undefined }>('vscode');

const bridge = {} as XcshRpcBridge;
const manager = {} as ContextManagerInterface;

function context(): vscode.ExtensionContext {
  return { subscriptions: [] } as unknown as vscode.ExtensionContext;
}

describe('optional editor APIs', () => {
  afterEach(() => jest.restoreAllMocks());

  it('leaves tool registration unavailable without throwing', () => {
    jest.replaceProperty(editor, 'lm', undefined);
    const ctx = context();
    expect(() => registerLanguageModelTools(ctx)).not.toThrow();
    expect(ctx.subscriptions).toHaveLength(0);
  });

  it('skips an absent model provider method even when lm exists', () => {
    jest.replaceProperty(editor, 'lm', {
      ...vscode.lm,
      registerLanguageModelChatProvider: undefined,
    } as unknown as typeof vscode.lm);
    expect(() => registerLanguageModelProvider(context(), bridge)).not.toThrow();
  });

  it('skips an absent chat namespace', () => {
    jest.replaceProperty(editor, 'chat', undefined);
    expect(() => registerChatParticipant(context(), bridge, manager)).not.toThrow();
  });
});
