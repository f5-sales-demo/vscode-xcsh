// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

interface BestPracticesInput {
  commonErrors?: Array<{ code: number; message: string; resolution: string; prevention?: string }>;
  securityNotes?: string[];
  performanceTips?: string[];
}

interface ConstraintInput {
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  format?: string;
  formatDescription?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBestPractices(bp: BestPracticesInput | undefined): string {
  if (!bp) {
    return '';
  }
  const parts: string[] = [];

  if (bp.commonErrors && bp.commonErrors.length > 0) {
    const rows = bp.commonErrors
      .map(
        (e) =>
          `<tr><td><code>${e.code}</code></td><td>${esc(e.message)}</td><td>${esc(e.resolution)}</td></tr>`,
      )
      .join('');
    parts.push(
      `<div class="bp-section"><h4>Common Errors</h4><table class="bp-table"><thead><tr><th>Code</th><th>Error</th><th>Resolution</th></tr></thead><tbody>${rows}</tbody></table></div>`,
    );
  }

  if (bp.securityNotes && bp.securityNotes.length > 0) {
    const items = bp.securityNotes.map((n) => `<li>${esc(n)}</li>`).join('');
    parts.push(`<div class="bp-section"><h4>Security Notes</h4><ul>${items}</ul></div>`);
  }

  if (bp.performanceTips && bp.performanceTips.length > 0) {
    const items = bp.performanceTips.map((t) => `<li>${esc(t)}</li>`).join('');
    parts.push(`<div class="bp-section"><h4>Performance Tips</h4><ul>${items}</ul></div>`);
  }

  if (parts.length === 0) {
    return '';
  }
  return `<div class="best-practices"><h3>Best Practices</h3>${parts.join('')}</div>`;
}

export function renderConstraintBadge(c: ConstraintInput | undefined): string {
  if (!c) {
    return '';
  }
  const badges: string[] = [];
  if (c.formatDescription) {
    badges.push(
      `<span class="badge badge-info" title="${esc(c.formatDescription)}">${esc(c.formatDescription)}</span>`,
    );
  } else if (c.pattern) {
    badges.push(`<span class="badge badge-info" title="Pattern: ${esc(c.pattern)}">pattern</span>`);
  }
  if (c.maxLength !== undefined) {
    badges.push(`<span class="badge badge-info">max ${c.maxLength}</span>`);
  }
  if (c.minLength !== undefined && c.minLength > 0) {
    badges.push(`<span class="badge badge-info">min ${c.minLength}</span>`);
  }
  return badges.join(' ');
}

export function renderConflictWarning(conflicts: string[] | undefined): string {
  if (!conflicts || conflicts.length === 0) {
    return '';
  }
  return `<span class="badge badge-warning" title="Conflicts with: ${conflicts.join(', ')}">conflicts</span>`;
}

export function renderDangerBadge(level: string | undefined): string {
  if (!level) {
    return '';
  }
  const colors: Record<string, string> = { low: '#28a745', medium: '#ffc107', high: '#dc3545' };
  const color = colors[level] || '#6c757d';
  return `<span class="badge" style="background:${color};color:#fff">${esc(level)} risk</span>`;
}

export function renderPerformanceHint(responseTime: string | undefined): string {
  if (!responseTime) {
    return '';
  }
  try {
    const parsed = JSON.parse(responseTime) as Record<string, unknown>;
    const p50 = parsed['p50_ms'];
    const p95 = parsed['p95_ms'];
    if (typeof p50 === 'number' || typeof p95 === 'number') {
      const parts: string[] = [];
      if (typeof p50 === 'number') {
        parts.push(`p50: ${p50}ms`);
      }
      if (typeof p95 === 'number') {
        parts.push(`p95: ${p95}ms`);
      }
      return `<span class="badge badge-info" title="Response time">${parts.join(', ')}</span>`;
    }
  } catch {
    /* not JSON */
  }
  return `<span class="badge badge-info">${esc(responseTime)}</span>`;
}
