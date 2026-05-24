// webview/src/components/SessionView.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { PlusIcon } from '../assets/icons';
import { createNewSession, getActiveSession, subscribe } from '../state/sessions';
import { ChatContainer } from './ChatContainer';

export function SessionView() {
  const activeSession = useSyncExternalStore(subscribe, getActiveSession);
  const [isEditing, setIsEditing] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const sessionSub = useCallback(
    (fn: () => void) => (activeSession ? activeSession.subscribe(fn) : () => {}),
    [activeSession],
  );
  const title = useSyncExternalStore(sessionSub, () => activeSession?.summary ?? 'Untitled');

  return (
    <div className="root">
      <div className="header">
        <div className="titleGroup">
          {isEditing ? (
            <input
              ref={titleInputRef}
              className="titleInput"
              defaultValue={title}
              onBlur={(e) => {
                const val = e.target.value.trim();
                if (val && activeSession) {
                  activeSession.summary = val;
                  activeSession.notify();
                }
                setIsEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  (e.target as HTMLInputElement).blur();
                }
                if (e.key === 'Escape') {
                  setIsEditing(false);
                }
              }}
            />
          ) : (
            <button type="button" className="titleText" title={title} onClick={() => setIsEditing(true)}>
              <span className="titleTextInner">{title}</span>
            </button>
          )}
        </div>
        <div className="headerSpacer" />
        <button className="iconButton" type="button" title="New conversation" onClick={() => createNewSession()}>
          <PlusIcon />
        </button>
      </div>
      <div className="body">
        <div className="content">
          {activeSession ? (
            <ChatContainer session={activeSession} />
          ) : (
            <div className="chatContainer">
              <div className="emptyState">
                <div className="emptyStateContent">What can I help you with?</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
