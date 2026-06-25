// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { findConflicts } from '../../providers/xcshConflictDiagnosticProvider';

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

    it('handles empty specProperties', () => {
      expect(findConflicts({}, [])).toEqual([]);
    });

    it('handles multiple conflict groups independently', () => {
      const specProperties: Record<string, unknown> = {
        no_waf: { 'x-f5xc-conflicts-with': ['app_firewall'] },
        app_firewall: { 'x-f5xc-conflicts-with': ['no_waf'] },
        no_challenge: { 'x-f5xc-conflicts-with': ['js_challenge'] },
        js_challenge: { 'x-f5xc-conflicts-with': ['no_challenge'] },
      };
      const conflicts = findConflicts(specProperties, ['no_waf', 'app_firewall', 'no_challenge', 'js_challenge']);
      expect(conflicts.length).toBeGreaterThanOrEqual(2);
    });

    it('detects conflict when field has multiple conflicts-with entries', () => {
      const specProperties: Record<string, unknown> = {
        round_robin: { 'x-f5xc-conflicts-with': ['least_active', 'random'] },
        least_active: { 'x-f5xc-conflicts-with': ['round_robin', 'random'] },
      };
      const conflicts = findConflicts(specProperties, ['round_robin', 'least_active']);
      expect(conflicts.length).toBeGreaterThan(0);
    });
  });
});
