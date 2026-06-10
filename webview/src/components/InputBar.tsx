// webview/src/components/InputBar.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PlusIcon, SendIcon, StopIcon } from '../assets/icons';
import { t } from '../lib/i18n';
import { on, sendRequestFilePicker, sendSetMode, sendSetThinking } from '../lib/protocol';
import { ModesMenu } from './ModesMenu';
import { SlashCommandMenu } from './SlashCommandMenu';

interface InputBarProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  busy: boolean;
}

export function InputBar({ onSubmit, onInterrupt, busy }: InputBarProps) {
  const inputRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [showModesMenu, setShowModesMenu] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [permissionMode, setPermissionMode] = useState('auto');
  const [thinkingLevel, setThinkingLevel] = useState('medium');
  const [attachedFile, setAttachedFile] = useState<{ name: string; content: string } | null>(null);

  const handleSubmit = useCallback(() => {
    const currentText = inputRef.current?.textContent ?? text;
    if (!currentText.trim() && !attachedFile) {
      return;
    }
    let finalText = currentText.trim();
    if (attachedFile) {
      finalText = `[Attached: ${attachedFile.name}]\n\n${attachedFile.content}\n\n${finalText}`;
      setAttachedFile(null);
    }
    onSubmit(finalText);
    if (inputRef.current) {
      inputRef.current.textContent = '';
    }
    setText('');
  }, [text, onSubmit, attachedFile]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showSlashMenu || showModesMenu) {
          setShowSlashMenu(false);
          setShowModesMenu(false);
        } else if (busy) {
          onInterrupt();
        }
      }
    },
    [handleSubmit, busy, onInterrupt, showSlashMenu, showModesMenu],
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
    const handler = () => {
      setShowModesMenu(false);
      setShowSlashMenu(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleAttachClick = useCallback(() => {
    sendRequestFilePicker();
  }, []);

  useEffect(() => {
    const unsub = on('file_attached', (msg) => {
      if (typeof msg.name === 'string' && typeof msg.content === 'string') {
        setAttachedFile({ name: msg.name, content: msg.content });
      }
    });
    return unsub;
  }, []);

  const handleSlashSelect = useCallback(
    (command: string) => {
      setAttachedFile(null);
      if (inputRef.current) {
        inputRef.current.textContent = '';
      }
      setText('');
      onSubmit(command);
      setShowSlashMenu(false);
    },
    [onSubmit],
  );

  const handleModeChange = useCallback((mode: string) => {
    setPermissionMode(mode);
    sendSetMode(mode);
  }, []);

  const handleThinkingChange = useCallback((level: string) => {
    setThinkingLevel(level);
    sendSetThinking(level);
  }, []);

  const placeholder = busy ? t('xcsh is responding...') : t('Ask xcsh...');

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
      {attachedFile && (
        <div className="attachedFileChip">
          <span className="attachedFileName">{attachedFile.name}</span>
          <button type="button" className="attachedFileRemove" title="Remove" onClick={() => setAttachedFile(null)}>
            ×
          </button>
        </div>
      )}
      <div className="inputFooter">
        <button type="button" className="footerBtn addBtn" title="Add file" onClick={handleAttachClick}>
          <PlusIcon />
        </button>
        <div className="slashBtnContainer" style={{ position: 'relative' }}>
          {showSlashMenu && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 10 }}>
              <SlashCommandMenu onSelect={handleSlashSelect} onClose={() => setShowSlashMenu(false)} />
            </div>
          )}
          <button
            type="button"
            className="footerBtn slashBtn"
            title="Slash commands"
            onClick={(e) => {
              e.stopPropagation();
              setShowSlashMenu(!showSlashMenu);
            }}
          >
            <span>/</span>
          </button>
        </div>
        <div className="footerSpacer" />
        <div className="modesBtnContainer" style={{ position: 'relative' }}>
          {showModesMenu && (
            <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 4, zIndex: 10 }}>
              <ModesMenu
                currentMode={permissionMode}
                onSelect={handleModeChange}
                onClose={() => setShowModesMenu(false)}
                thinkingLevel={thinkingLevel}
                onThinkingChange={handleThinkingChange}
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
            <span>
              {permissionMode === 'auto' ? t('Auto') : permissionMode === 'confirm' ? t('Confirm') : t('Read-only')}
            </span>
          </button>
        </div>
        {busy ? (
          <button type="button" className="footerBtn sendBtn stopBtn" title={t('Stop (Esc)')} onClick={onInterrupt}>
            <StopIcon />
          </button>
        ) : (
          <button
            type="submit"
            className="footerBtn sendBtn"
            title={t('Send (Enter)')}
            onClick={handleSubmit}
            disabled={!text.trim() && !attachedFile}
          >
            <SendIcon />
          </button>
        )}
      </div>
    </fieldset>
  );
}
