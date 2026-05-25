// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import {
  renderBestPractices,
  renderConflictWarning,
  renderConstraintBadge,
  renderDangerBadge,
} from '../../providers/metadataRenderer';

describe('metadataRenderer', () => {
  describe('renderBestPractices', () => {
    it('returns HTML with common errors', () => {
      const html = renderBestPractices({
        commonErrors: [{ code: 400, message: 'Bad request', resolution: 'Check fields' }],
      });
      expect(html).toContain('400');
      expect(html).toContain('Check fields');
    });

    it('returns HTML with security notes', () => {
      const html = renderBestPractices({ securityNotes: ['Use HTTPS'] });
      expect(html).toContain('Use HTTPS');
    });

    it('returns HTML with performance tips', () => {
      const html = renderBestPractices({ performanceTips: ['Paginate'] });
      expect(html).toContain('Paginate');
    });

    it('returns empty string for undefined', () => {
      expect(renderBestPractices(undefined)).toBe('');
    });

    it('returns empty string for empty object', () => {
      expect(renderBestPractices({})).toBe('');
    });
  });

  describe('renderConstraintBadge', () => {
    it('returns badge for maxLength', () => {
      expect(renderConstraintBadge({ maxLength: 64 })).toContain('64');
    });

    it('returns badge with formatDescription', () => {
      expect(renderConstraintBadge({ formatDescription: 'DNS label' })).toContain('DNS label');
    });

    it('returns empty for undefined', () => {
      expect(renderConstraintBadge(undefined)).toBe('');
    });

    it('returns empty for empty object', () => {
      expect(renderConstraintBadge({})).toBe('');
    });
  });

  describe('renderConflictWarning', () => {
    it('returns warning with field names', () => {
      const html = renderConflictWarning(['spec.other']);
      expect(html).toContain('other');
    });

    it('returns empty for empty array', () => {
      expect(renderConflictWarning([])).toBe('');
    });

    it('returns empty for undefined', () => {
      expect(renderConflictWarning(undefined)).toBe('');
    });
  });

  describe('renderDangerBadge', () => {
    it('returns red badge for high', () => {
      expect(renderDangerBadge('high')).toContain('high');
      expect(renderDangerBadge('high')).toContain('#dc3545');
    });

    it('returns empty for undefined', () => {
      expect(renderDangerBadge(undefined)).toBe('');
    });
  });
});
