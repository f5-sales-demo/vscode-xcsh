// webview/src/components/InputBar.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PlusIcon, SendIcon, StopIcon } from '../assets/icons';
import { type Attachment, addAttachment, serializeAttachments } from '../lib/attachmentTypes';
import { t } from '../lib/i18n';
import {
  type AttachCategory,
  on,
  sendReady,
  sendRequestAttachment,
  sendSetMode,
  sendSetThinking,
  type ToolInfo,
} from '../lib/protocol';
import { serializeSessionTranscript } from '../state/session';
import { getActiveSession } from '../state/sessions';
import { AttachMenu } from './AttachMenu';
import { ModesMenu } from './ModesMenu';
import { SlashCommandMenu } from './SlashCommandMenu';
import { ToolsPickerMenu } from './ToolsPickerMenu';

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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showToolsPicker, setShowToolsPicker] = useState(false);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [permissionMode, setPermissionMode] = useState('auto');
  const [thinkingLevel, setThinkingLevel] = useState('medium');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleSubmit = useCallback(() => {
    const currentText = inputRef.current?.textContent ?? text;
    if (!currentText.trim() && attachments.length === 0) {
      return;
    }
    const trimmed = currentText.trim();
    const prefix = serializeAttachments(attachments);
    const finalText = prefix ? (trimmed ? `${prefix}\n\n${trimmed}` : prefix) : trimmed;
    onSubmit(finalText);
    setAttachments([]);
    if (inputRef.current) {
      inputRef.current.textContent = '';
    }
    setText('');
  }, [text, onSubmit, attachments]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showSlashMenu || showModesMenu || showAttachMenu || showToolsPicker) {
          setShowSlashMenu(false);
          setShowModesMenu(false);
          setShowAttachMenu(false);
          setShowToolsPicker(false);
        } else if (busy) {
          onInterrupt();
        }
      }
    },
    [handleSubmit, busy, onInterrupt, showSlashMenu, showModesMenu, showAttachMenu, showToolsPicker],
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
      setShowAttachMenu(false);
      setShowToolsPicker(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const handleCategorySelect = useCallback((category: AttachCategory) => {
    setShowAttachMenu(false);
    if (category === 'tools') {
      setShowToolsPicker(true);
      return;
    }
    if (category === 'sessions') {
      const session = getActiveSession();
      if (!session) {
        return;
      }
      const attachment: Attachment = {
        id: crypto.randomUUID(),
        kind: 'sessions',
        label: `Session: ${session.summary}`,
        dedupKey: `sessions:${session.id}`,
        content: serializeSessionTranscript(session),
        sessionId: session.id,
      };
      setAttachments((prev) => addAttachment(prev, attachment).list);
      return;
    }
    sendRequestAttachment(category);
  }, []);

  const handleToolsConfirm = useCallback(
    (names: string[]) => {
      setShowToolsPicker(false);
      if (names.length === 0) {
        return;
      }
      const lines = names.map((name) => {
        const info = tools.find((x) => x.name === name);
        return `- ${info?.label ?? name} (${name})${info?.description ? `: ${info.description}` : ''}`;
      });
      const attachment: Attachment = {
        id: crypto.randomUUID(),
        kind: 'tools',
        label: names.length === 1 ? '1 tool' : `${names.length} tools`,
        dedupKey: 'tools',
        content: `Requested tools:\n${lines.join('\n')}`,
        toolNames: names,
      };
      setAttachments((prev) => addAttachment(prev, attachment).list);
    },
    [tools],
  );

  useEffect(() => {
    const unsubAttach = on('attachment_added', (msg) => {
      const attachment = msg.attachment as Attachment | undefined;
      if (!attachment || typeof attachment.dedupKey !== 'string' || typeof attachment.content !== 'string') {
        return;
      }
      setAttachments((prev) => addAttachment(prev, attachment).list);
    });
    const unsubTools = on('tools_available', (msg) => {
      const list = msg.tools as ToolInfo[] | undefined;
      if (Array.isArray(list)) {
        setTools(list);
      }
    });
    // Listeners are live — tell the extension it may flush any attachment buffered
    // while the panel was opening and send the available tools.
    sendReady();
    return () => {
      unsubAttach();
      unsubTools();
    };
  }, []);

  const handleSlashSelect = useCallback(
    (command: string) => {
      setAttachments([]);
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
  const canSubmit = text.trim().length > 0 || attachments.length > 0;

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
      {attachments.length > 0 && (
        <div className="attachmentChipList">
          {attachments.map((a) => (
            <div key={a.id} className="attachedFileChip">
              <span className="attachedFileKind">{a.kind}</span>
              <span className="attachedFileName">{a.label}</span>
              <button
                type="button"
                className="attachedFileRemove"
                title={t('Remove')}
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="inputFooter">
        <div className="attachBtnContainer" style={{ position: 'relative' }}>
          {showAttachMenu && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 10 }}>
              <AttachMenu onSelect={handleCategorySelect} onClose={() => setShowAttachMenu(false)} />
            </div>
          )}
          {showToolsPicker && (
            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, zIndex: 10 }}>
              <ToolsPickerMenu tools={tools} onConfirm={handleToolsConfirm} onClose={() => setShowToolsPicker(false)} />
            </div>
          )}
          <button
            type="button"
            className="footerBtn addBtn"
            title={t('Add context')}
            onClick={(e) => {
              e.stopPropagation();
              setShowAttachMenu(!showAttachMenu);
            }}
          >
            <PlusIcon />
          </button>
        </div>
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
            disabled={!canSubmit}
          >
            <SendIcon />
          </button>
        )}
      </div>
    </fieldset>
  );
}
