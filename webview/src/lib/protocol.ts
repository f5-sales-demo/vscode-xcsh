// webview/src/lib/protocol.ts
// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): Record<string, unknown>;
  setState(state: Record<string, unknown>): void;
}

export interface ExtensionMessage {
  type: string;
  [key: string]: unknown;
}

interface ExtensionEnvelope {
  type: 'from-extension';
  message: ExtensionMessage;
}

declare function acquireVsCodeApi(): VsCodeApi;

let vscodeApi: VsCodeApi | null = null;
const listeners = new Map<string, Set<(msg: ExtensionMessage) => void>>();

export function initProtocol(): void {
  if (vscodeApi) {
    return;
  }
  vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as ExtensionEnvelope | undefined;
    if (!data || data.type !== 'from-extension') {
      return;
    }
    const msg = data.message;
    if (!msg) {
      return;
    }

    const typeListeners = listeners.get(msg.type);
    if (typeListeners) {
      for (const fn of typeListeners) {
        fn(msg);
      }
    }

    const wildcardListeners = listeners.get('*');
    if (wildcardListeners) {
      for (const fn of wildcardListeners) {
        fn(msg);
      }
    }
  });
}

export function send(msg: unknown): void {
  if (!vscodeApi) {
    throw new Error('Protocol not initialized');
  }
  vscodeApi.postMessage(msg);
}

export function on(type: string, callback: (msg: ExtensionMessage) => void): () => void {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  // biome-ignore lint/style/noNonNullAssertion: map.get after map.has is safe
  listeners.get(type)!.add(callback);
  return () => listeners.get(type)?.delete(callback);
}

export function getState(): Record<string, unknown> {
  return vscodeApi?.getState() ?? {};
}

export function setState(state: Record<string, unknown>): void {
  vscodeApi?.setState(state);
}

export function sendPrompt(text: string): void {
  send({ type: 'prompt', text });
}

export function sendAbort(): void {
  send({ type: 'abort' });
}

export function sendSetMode(mode: string): void {
  send({ type: 'set_mode', mode });
}

export function sendSetThinking(level: string): void {
  send({ type: 'set_thinking', level });
}

/** Categories resolved by the extension host (Files/Folders, Problems, Symbols, ...). */
export type HostAttachmentCategory = 'files' | 'instructions' | 'scm' | 'problems' | 'symbols';

/**
 * Ask the host to run the attachment picker for a category. The host replies
 * with one `attachment_added` message per resolved item. Categories handled
 * entirely in the webview ('sessions', 'tools') are never sent here.
 */
export function sendRequestAttachment(category: HostAttachmentCategory): void {
  send({ type: 'request_attachment', category });
}

/**
 * Signal that the app has mounted and its message listeners are registered.
 * The extension buffers injected attachments (e.g. "Add to xcsh chat") until it
 * receives this, avoiding the panel-open load race.
 */
export function sendReady(): void {
  send({ type: 'webview_ready' });
}
