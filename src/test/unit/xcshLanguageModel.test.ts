// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { convertMessagesToPrompt, extractTextFromMessageContent } from '../../xcsh/languageModelProvider';

describe('convertMessagesToPrompt', () => {
  it('extracts last user message', () => {
    const messages = [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Follow-up question' },
    ];
    const result = convertMessagesToPrompt(messages);
    expect(result).toBe('Follow-up question');
  });

  it('returns empty for no user messages', () => {
    const messages = [{ role: 'assistant', content: 'Hello' }];
    const result = convertMessagesToPrompt(messages);
    expect(result).toBe('');
  });

  it('returns empty for empty array', () => {
    const result = convertMessagesToPrompt([]);
    expect(result).toBe('');
  });

  it('handles single user message', () => {
    const messages = [{ role: 'user', content: 'Only message' }];
    const result = convertMessagesToPrompt(messages);
    expect(result).toBe('Only message');
  });
});

describe('extractTextFromMessageContent', () => {
  it('extracts text from LanguageModelTextPart instances', () => {
    const vscode = require('vscode');
    const parts = [new vscode.LanguageModelTextPart('hello'), new vscode.LanguageModelTextPart(' world')];
    const result = extractTextFromMessageContent(parts);
    expect(result).toBe('hello world');
  });

  it('extracts text from plain strings', () => {
    const result = extractTextFromMessageContent(['hello', ' world']);
    expect(result).toBe('hello world');
  });

  it('extracts text from objects with value property', () => {
    const result = extractTextFromMessageContent([{ value: 'hello' }]);
    expect(result).toBe('hello');
  });

  it('returns empty for empty array', () => {
    const result = extractTextFromMessageContent([]);
    expect(result).toBe('');
  });

  it('skips LanguageModelToolCallPart and LanguageModelToolResultPart', () => {
    const vscode = require('vscode');
    const parts = [
      new vscode.LanguageModelTextPart('text before'),
      new vscode.LanguageModelToolCallPart('tc-1', 'readFile', { path: '/test' }),
      new vscode.LanguageModelTextPart('text after'),
    ];
    const result = extractTextFromMessageContent(parts);
    expect(result).toBe('text beforetext after');
  });
});
