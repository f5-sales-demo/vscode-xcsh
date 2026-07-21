// webview/src/components/ComposerHost.tsx
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.
//
// VS Code host wiring for the shared `@f5-sales-demo/xcsh-chat-ui` Composer
// (vendored under ../vendored/chat-ui). This replaces the bespoke InputBar: it owns
// the composer state (attachments, host tools, permission mode, thinking level)
// and the webview↔extension protocol, and feeds the headless shared Composer its
// props. The shared Composer renders the editor, chips, attach/slash/tools/mode
// menus, and send/stop; this file supplies data + callbacks only.

import { useCallback, useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import {
  type AttachCategory,
  type HostAttachmentCategory,
  on,
  sendReady,
  sendRequestAttachment,
  sendSetMode,
  sendSetThinking,
  type ToolInfo,
} from '../lib/protocol';
import { serializeSessionTranscript } from '../state/session';
import { getActiveSession } from '../state/sessions';
import { type Attachment, addAttachment, Composer, type SlashCommand, type ToolItem } from '../vendored/chat-ui';

interface ComposerHostProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  busy: boolean;
}

/** The composer's attach categories (VS Code's picker). `tools` opens the shared
 *  multi-select picker; `sessions` is resolved in-webview; the rest round-trip. */
const CATEGORIES: { id: AttachCategory; label: () => string; description: () => string }[] = [
  { id: 'files', label: () => t('Files & Folders'), description: () => t('Attach workspace files or folders') },
  { id: 'instructions', label: () => t('Instructions'), description: () => t('Attach an instruction file') },
  { id: 'scm', label: () => t('Source Control'), description: () => t('Attach changed-file diffs') },
  { id: 'problems', label: () => t('Problems'), description: () => t('Attach workspace diagnostics') },
  { id: 'symbols', label: () => t('Symbols'), description: () => t('Search and attach workspace symbols') },
  { id: 'sessions', label: () => t('Sessions'), description: () => t('Attach the current session transcript') },
  { id: 'tools', label: () => t('Tools'), description: () => t('Select tools to reference') },
];

const SLASH_COMMANDS: SlashCommand[] = [
  { command: '/status', label: t('Status'), description: t('Show integration health') },
  { command: '/context', label: t('Context'), description: t('Show active xcsh context') },
  { command: '/resources', label: t('Resources'), description: t('Browse current namespace') },
];

/** Permission modes map onto the shared Composer's `modes` list. */
const MODES = [
  { id: 'auto', label: t('Auto'), blurb: t('xcsh runs tools automatically') },
  { id: 'confirm', label: t('Confirm'), blurb: t('Preference hint: ask before tool execution') },
  { id: 'readonly', label: t('Read-only'), blurb: t('Preference hint: suggest read-only operations') },
];

const THINKING_LEVELS = ['low', 'medium', 'high', 'xhigh'];

export function ComposerHost({ onSubmit, onInterrupt, busy }: ComposerHostProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [permissionMode, setPermissionMode] = useState('auto');
  const [thinkingLevel, setThinkingLevel] = useState('medium');

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

  // Category pick: `tools` is handled by the shared Composer's multi-select picker
  // (see onToolsConfirm); `sessions` is built in-webview; the rest round-trip.
  const handleCategory = useCallback((id: string) => {
    if (id === 'sessions') {
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
    // `tools` is intercepted by the shared Composer's picker and `sessions` returned
    // above, so anything reaching here is a host-resolved category.
    sendRequestAttachment(id as HostAttachmentCategory);
  }, []);

  const handleToolsConfirm = useCallback(
    (names: string[]) => {
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

  // The shared Composer prepends the serialized attachments to the message; clear
  // the controlled list after each send.
  const handleSend = useCallback(
    (text: string) => {
      onSubmit(text);
      setAttachments([]);
    },
    [onSubmit],
  );

  const handleSlashSelect = useCallback(
    (command: string) => {
      setAttachments([]);
      onSubmit(command);
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

  const toolItems: ToolItem[] = tools.map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
  }));

  return (
    <Composer
      streaming={busy}
      placeholder={busy ? t('xcsh is responding...') : t('Ask xcsh...')}
      onSend={handleSend}
      onStop={onInterrupt}
      attachments={attachments}
      attachCategories={CATEGORIES.map((c) => ({ id: c.id, label: c.label(), description: c.description() }))}
      onRequestAttachment={handleCategory}
      onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
      tools={toolItems}
      onToolsConfirm={handleToolsConfirm}
      slashCommands={SLASH_COMMANDS}
      onSlashSelect={handleSlashSelect}
      modes={MODES}
      mode={permissionMode}
      onModeChange={handleModeChange}
      thinkingLevels={THINKING_LEVELS}
      thinkingLevel={thinkingLevel}
      onThinkingChange={handleThinkingChange}
    />
  );
}
