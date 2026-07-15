// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Unit tests for runtime namespace-profile resolution (issue #726).
 *
 * Manually-defined resource types (curated overrides with no generated spec
 * entry, e.g. `user`) must resolve their namespace profile from the authoritative
 * baked map — never from a hardcoded literal that can drift from / contradict
 * upstream. The authoritative map is the single source of truth.
 */

import { isResourceTypeAvailableForNamespace, RESOURCE_TYPES } from '../../api/resourceTypes';
import { NAMESPACE_PROFILES_MAP, resolveNamespaceProfileForKey } from '../../generated/namespaceProfiles';
import { GENERATED_RESOURCE_TYPES } from '../../generated/resourceTypesBase';

describe('Runtime namespace-profile resolution (#726)', () => {
  describe('resolveNamespaceProfileForKey', () => {
    it('returns the explicit map entry for a classified resource', () => {
      expect(resolveNamespaceProfileForKey('user')).toEqual(NAMESPACE_PROFILES_MAP.resources.user);
    });

    it('falls back to the map default for an unclassified key', () => {
      const bogus = '____not_a_real_resource_key____';
      expect(NAMESPACE_PROFILES_MAP.resources[bogus]).toBeUndefined();
      expect(resolveNamespaceProfileForKey(bogus)).toEqual(NAMESPACE_PROFILES_MAP.default);
    });
  });

  describe('manually-defined resource types resolve from the map', () => {
    it('`user` has no generated spec entry (it is a curated manual override)', () => {
      // Guards the premise of this fix: user is not produced by the generator,
      // so without runtime map resolution it can only hardcode its profile.
      expect(GENERATED_RESOURCE_TYPES.user).toBeUndefined();
    });

    it('`user` resolves to the authoritative map profile, not a hardcoded literal', () => {
      const user = RESOURCE_TYPES.user;
      expect(user).toBeDefined();
      expect(user?.namespaceProfile).toEqual(resolveNamespaceProfileForKey('user'));
    });

    it('`user` is advisory system-only (enforced:false) per the map', () => {
      // Upstream classifies user as system-only but UNVERIFIED (advisory). The
      // extension must not assert enforcement the map does not.
      const c = RESOURCE_TYPES.user?.namespaceProfile?.constraint;
      expect(c?.allowed).toEqual(['system']);
      expect(c?.enforced).toBe(false);
    });

    it('`user` (system-only) is hidden from a custom namespace — default-deny display', () => {
      // Default-deny: a system-only allow-list hides the resource from user
      // namespaces regardless of the advisory/verified `enforced` flag.
      const user = RESOURCE_TYPES.user;
      expect(user).toBeDefined();
      if (user) {
        expect(isResourceTypeAvailableForNamespace(user, 'my-custom-ns')).toBe(false);
        expect(isResourceTypeAvailableForNamespace(user, 'system')).toBe(true);
      }
    });
  });

  describe('single source of truth: no runtime profile diverges from the map', () => {
    it('every RESOURCE_TYPES profile equals the authoritative map resolution for its key', () => {
      const divergent: string[] = [];
      for (const [key, info] of Object.entries(RESOURCE_TYPES)) {
        if (!info.namespaceProfile) {
          continue; // no profile is a separate concern; this guard is about divergence
        }
        const expected = resolveNamespaceProfileForKey(key);
        try {
          expect(info.namespaceProfile).toEqual(expected);
        } catch {
          divergent.push(key);
        }
      }
      expect(divergent).toEqual([]);
    });
  });
});
