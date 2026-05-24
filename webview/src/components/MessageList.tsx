// webview/src/components/MessageList.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import type { AssistantMessage, ChatMessage } from '../state/session';
import { ContentBlockRenderer } from './ContentBlockRenderer';

interface MessageListProps {
  messages: ChatMessage[];
  busy: boolean;
}

interface Turn {
  user: ChatMessage | null;
  assistants: { msg: AssistantMessage; idx: number }[];
}

export function MessageList({ messages, busy }: MessageListProps) {
  const turns: Turn[] = [];
  let currentTurn: Turn | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.type === 'user') {
      currentTurn = { user: msg, assistants: [] };
      turns.push(currentTurn);
    } else if (msg.type === 'assistant') {
      if (!currentTurn) {
        currentTurn = { user: null, assistants: [] };
        turns.push(currentTurn);
      }
      currentTurn.assistants.push({ msg, idx: i });
    }
  }

  return (
    <div className="messagesList">
      {turns.map((turn, ti) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: turns are append-only; index is stable
        <div key={ti} className="turn">
          {turn.user && turn.user.type === 'user' && (
            <div className="userMessage">
              <div className="userMessageText">{turn.user.text}</div>
            </div>
          )}
          {turn.assistants.map(({ msg, idx }, ai) => {
            const isLast = idx === messages.length - 1;
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: assistant messages are append-only; index is stable
              <div key={ai} className="assistantMessage">
                {msg.blocks.map((block, bi) => (
                  <ContentBlockRenderer
                    // biome-ignore lint/suspicious/noArrayIndexKey: content blocks are append-only; index is stable
                    key={bi}
                    block={block}
                    isLast={isLast && bi === msg.blocks.length - 1}
                    busy={busy}
                  />
                ))}
              </div>
            );
          })}
          {busy && ti === turns.length - 1 && turn.assistants.length === 0 && (
            <div className="thinkingIndicator">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
