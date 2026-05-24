// webview/src/components/InputBar.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PlusIcon, SendIcon, StopIcon } from '../assets/icons';
import { ModesMenu } from './ModesMenu';

interface InputBarProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  busy: boolean;
}

export function InputBar({ onSubmit, onInterrupt, busy }: InputBarProps) {
  const inputRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [showModesMenu, setShowModesMenu] = useState(false);
  const [permissionMode, setPermissionMode] = useState('auto');
  const [thinkingLevel, setThinkingLevel] = useState('medium');

  const handleSubmit = useCallback(() => {
    const currentText = inputRef.current?.textContent ?? text;
    if (!currentText.trim()) {
      return;
    }
    onSubmit(currentText.trim());
    if (inputRef.current) {
      inputRef.current.textContent = '';
    }
    setText('');
  }, [text, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape' && busy) {
        e.preventDefault();
        onInterrupt();
      }
    },
    [handleSubmit, busy, onInterrupt],
  );

  const handleInput = useCallback(() => {
    setText(inputRef.current?.textContent ?? '');
  }, []);

  useEffect(() => {
    if (!busy) {
      inputRef.current?.focus();
    }
  }, [busy]);

  useEffect(() => {
    const handler = () => setShowModesMenu(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const placeholder = busy ? 'xcsh is responding...' : 'Ask xcsh...';

  return (
    <fieldset className="inputBar">
      <div className="inputBarBackground" />
      <div className="inputEditorContainer">
        {/* biome-ignore lint/a11y/useSemanticElements: contentEditable requires a div; role+tabIndex provide equivalent semantics */}
        <div
          ref={inputRef}
          contentEditable="plaintext-only"
          className="inputEditor"
          role="textbox"
          aria-label="Message input"
          aria-multiline="true"
          tabIndex={0}
          data-placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          suppressContentEditableWarning
        />
      </div>
      <div className="inputFooter">
        <button type="button" className="footerBtn addBtn" title="Add">
          <PlusIcon />
        </button>
        <div className="footerSpacer" />
        <div className="modesBtnContainer" style={{ position: 'relative' }}>
          {showModesMenu && (
            <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 4, zIndex: 10 }}>
              <ModesMenu
                currentMode={permissionMode}
                onSelect={setPermissionMode}
                onClose={() => setShowModesMenu(false)}
                thinkingLevel={thinkingLevel}
                onThinkingChange={setThinkingLevel}
              />
            </div>
          )}
          <button
            type="button"
            className="footerBtn modeBtn"
            title="Click to change mode"
            onClick={(e) => {
              e.stopPropagation();
              setShowModesMenu(!showModesMenu);
            }}
          >
            <span>{permissionMode === 'auto' ? 'Auto' : permissionMode === 'confirm' ? 'Confirm' : 'Read-only'}</span>
          </button>
        </div>
        {busy ? (
          <button type="button" className="footerBtn sendBtn stopBtn" title="Stop (Esc)" onClick={onInterrupt}>
            <StopIcon />
          </button>
        ) : (
          <button
            type="submit"
            className="footerBtn sendBtn"
            title="Send (Enter)"
            onClick={handleSubmit}
            disabled={!text.trim()}
          >
            <SendIcon />
          </button>
        )}
      </div>
    </fieldset>
  );
}
