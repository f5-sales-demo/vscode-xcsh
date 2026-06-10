// webview/src/components/ChatContainer.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { t } from '../lib/i18n';
import { sendAbort, sendPrompt } from '../lib/protocol';
import type { Session } from '../state/session';
import { EmptyState } from './EmptyState';
import { InputBar } from './InputBar';
import { MessageList } from './MessageList';

interface ChatContainerProps {
  session: Session;
}

export function ChatContainer({ session }: ChatContainerProps) {
  const sub = useCallback((fn: () => void) => session.subscribe(fn), [session]);
  const messages = useSyncExternalStore(sub, () => session.messages);
  const busy = useSyncExternalStore(sub, () => session.busy);
  const error = useSyncExternalStore(sub, () => session.error);

  const messagesRef = useRef<HTMLDivElement>(null);
  const userAtBottom = useRef(true);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }
    userAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }, []);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }
    if (userAtBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  });

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim()) {
        return;
      }
      session.addUserMessage(text.trim());
      sendPrompt(text.trim());
    },
    [session],
  );

  const handleInterrupt = useCallback(() => {
    sendAbort();
    session.endTurn();
  }, [session]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && busy) {
        e.preventDefault();
        handleInterrupt();
      }
    };
    document.body.addEventListener('keydown', handler);
    return () => document.body.removeEventListener('keydown', handler);
  }, [busy, handleInterrupt]);

  return (
    <div className="chatContainer">
      <div className="messagesContainer" ref={messagesRef} onScroll={handleScroll}>
        {messages.length === 0 && !busy ? <EmptyState /> : <MessageList messages={messages} busy={busy} />}
      </div>
      <div className="messageGradient" />
      {error && (
        <div className="errorBanner">
          <div className="errorMessage">{error}</div>
          <button
            className="errorDismiss"
            type="button"
            onClick={() => {
              session.error = null;
              session.notify();
            }}
          >
            {t('Dismiss')}
          </button>
        </div>
      )}
      <div className="inputContainer">
        <InputBar onSubmit={handleSubmit} onInterrupt={handleInterrupt} busy={busy} />
      </div>
    </div>
  );
}
