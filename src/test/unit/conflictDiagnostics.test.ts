// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { findConflicts } from '../../providers/f5xcConflictDiagnosticProvider';

describe('Conflict diagnostics', () => {
  describe('findConflicts', () => {
    it('detects conflicting fields when both are set', () => {
      const specProperties: Record<string, unknown> = {
        no_service_policies: { 'x-f5xc-conflicts-with': ['active_service_policies'] },
        active_service_policies: { 'x-f5xc-conflicts-with': ['no_service_policies'] },
      };
      const conflicts = findConflicts(specProperties, ['no_service_policies', 'active_service_policies']);
      expect(conflicts.length).toBeGreaterThan(0);
      expect(conflicts[0]?.field).toBe('no_service_policies');
      expect(conflicts[0]?.conflictsWith).toBe('active_service_policies');
    });

    it('returns empty when no conflicts exist', () => {
      const specProperties: Record<string, unknown> = {
        no_service_policies: { 'x-f5xc-conflicts-with': ['active_service_policies'] },
        some_other_field: {},
      };
      expect(findConflicts(specProperties, ['no_service_policies', 'some_other_field'])).toEqual([]);
    });

    it('returns empty when only one side of conflict is set', () => {
      const specProperties: Record<string, unknown> = {
        no_service_policies: { 'x-f5xc-conflicts-with': ['active_service_policies'] },
      };
      expect(findConflicts(specProperties, ['no_service_policies'])).toEqual([]);
    });

    it('returns empty for properties without conflict metadata', () => {
      const specProperties: Record<string, unknown> = {
        field_a: { type: 'string' },
        field_b: { type: 'number' },
      };
      expect(findConflicts(specProperties, ['field_a', 'field_b'])).toEqual([]);
    });
  });
});
