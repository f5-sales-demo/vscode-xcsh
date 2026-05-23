// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { convertMessagesToPrompt } from '../../xcsh/languageModelProvider';

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
