// webview/src/state/session.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  toolName: string;
  toolCallId: string;
  running: boolean;
  input?: string;
  output?: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  durationMs?: number;
}

export type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock;

export interface UserMessage {
  type: 'user';
  text: string;
}

export interface AssistantMessage {
  type: 'assistant';
  blocks: ContentBlock[];
}

export type ChatMessage = UserMessage | AssistantMessage;

export interface Session {
  id: string;
  summary: string;
  messages: ChatMessage[];
  busy: boolean;
  error: string | null;
  subscribe(fn: () => void): () => void;
  notify(): void;
  addUserMessage(text: string): void;
  appendAssistantText(text: string): void;
  addToolStart(toolName: string, toolCallId: string): void;
  endToolUse(toolCallId: string): void;
  endTurn(): void;
}

export function createSession(): Session {
  const listeners = new Set<() => void>();

  const session: Session = {
    id: crypto.randomUUID(),
    summary: 'Untitled',
    messages: [],
    busy: false,
    error: null,

    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    notify(): void {
      session.messages = [...session.messages];
      for (const fn of listeners) {
        fn();
      }
    },

    addUserMessage(text: string): void {
      session.messages = [...session.messages, { type: 'user', text }];
      session.busy = true;
      session.notify();
    },

    appendAssistantText(text: string): void {
      const msgs = [...session.messages];
      const last = msgs[msgs.length - 1];
      if (last?.type === 'assistant') {
        const blocks = [...last.blocks];
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === 'text') {
          blocks[blocks.length - 1] = { ...lastBlock, text: lastBlock.text + text };
        } else {
          blocks.push({ type: 'text', text });
        }
        msgs[msgs.length - 1] = { ...last, blocks };
      } else {
        msgs.push({ type: 'assistant', blocks: [{ type: 'text', text }] });
      }
      session.messages = msgs;
      session.notify();
    },

    addToolStart(toolName: string, toolCallId: string): void {
      const msgs = [...session.messages];
      const last = msgs[msgs.length - 1];
      if (last?.type === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          blocks: [...last.blocks, { type: 'tool_use', toolName, toolCallId, running: true }],
        };
      } else {
        msgs.push({ type: 'assistant', blocks: [{ type: 'tool_use', toolName, toolCallId, running: true }] });
      }
      session.messages = msgs;
      session.notify();
    },

    endToolUse(toolCallId: string): void {
      session.messages = session.messages.map((msg) => {
        if (msg.type !== 'assistant') {
          return msg;
        }
        const hasTarget = msg.blocks.some((b) => b.type === 'tool_use' && b.toolCallId === toolCallId);
        if (!hasTarget) {
          return msg;
        }
        return {
          ...msg,
          blocks: msg.blocks.map((block) =>
            block.type === 'tool_use' && block.toolCallId === toolCallId ? { ...block, running: false } : block,
          ),
        };
      });
      session.notify();
    },

    endTurn(): void {
      session.busy = false;
      session.notify();
    },
  };

  return session;
}
