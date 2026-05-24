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
      for (const fn of listeners) {
        fn();
      }
    },

    addUserMessage(text: string): void {
      session.messages.push({ type: 'user', text });
      session.busy = true;
      session.notify();
    },

    appendAssistantText(text: string): void {
      const last = session.messages[session.messages.length - 1];
      if (last?.type === 'assistant') {
        const lastBlock = last.blocks[last.blocks.length - 1];
        if (lastBlock?.type === 'text') {
          lastBlock.text += text;
        } else {
          last.blocks.push({ type: 'text', text });
        }
      } else {
        session.messages.push({
          type: 'assistant',
          blocks: [{ type: 'text', text }],
        });
      }
      session.notify();
    },

    addToolStart(toolName: string, toolCallId: string): void {
      const last = session.messages[session.messages.length - 1];
      if (last?.type === 'assistant') {
        last.blocks.push({ type: 'tool_use', toolName, toolCallId, running: true });
      } else {
        session.messages.push({
          type: 'assistant',
          blocks: [{ type: 'tool_use', toolName, toolCallId, running: true }],
        });
      }
      session.notify();
    },

    endToolUse(toolCallId: string): void {
      for (const msg of session.messages) {
        if (msg.type !== 'assistant') {
          continue;
        }
        for (const block of msg.blocks) {
          if (block.type === 'tool_use' && block.toolCallId === toolCallId) {
            block.running = false;
          }
        }
      }
      session.notify();
    },

    endTurn(): void {
      session.busy = false;
      session.notify();
    },
  };

  return session;
}
