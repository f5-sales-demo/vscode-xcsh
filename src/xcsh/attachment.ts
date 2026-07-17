// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Shared helpers for attaching content to the xcsh chat as context.
 *
 * The chat's InputBar consumes a `file_attached { name, content }` message and
 * folds the content into the next prompt. These helpers are used by every path
 * that injects an attachment (the file picker, the resource webview button, and
 * the tree right-click command) so the size limit and naming stay consistent.
 */

/** Maximum attachment payload size (bytes). Matches the file-picker guard. */
export const MAX_ATTACHMENT_BYTES = 512 * 1024;

/**
 * Build a descriptive attachment name for a resource JSON payload, e.g.
 * `("http_loadbalancers", "acme-bankexample-lb")` → `"acme-bankexample-lb.http_loadbalancers.json"`.
 *
 * Characters outside the filename-safe set are collapsed to `-` so the chip
 * label reads cleanly regardless of the resource name.
 */
export function buildAttachmentName(resourceType: string, resourceName: string): string {
  const safe = (s: string): string =>
    s
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');

  const name = safe(resourceName) || 'resource';
  const type = safe(resourceType);
  return type ? `${name}.${type}.json` : `${name}.json`;
}
