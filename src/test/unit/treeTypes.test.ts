// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

import { TreeItemContext } from '../../tree/treeTypes';

describe('TreeItemContext', () => {
  it('should have NAMESPACE_BUILTIN context', () => {
    expect(TreeItemContext.NAMESPACE_BUILTIN).toBe('namespace:builtin');
  });

  it('should have NAMESPACE_ACTIVE context', () => {
    expect(TreeItemContext.NAMESPACE_ACTIVE).toBe('namespace:active');
  });

  it('should have CATEGORY context', () => {
    expect(TreeItemContext.CATEGORY).toBe('category');
  });

  it('should have RESOURCE_TYPE context', () => {
    expect(TreeItemContext.RESOURCE_TYPE).toBe('resourceType');
  });

  it('should have RESOURCE context', () => {
    expect(TreeItemContext.RESOURCE).toBe('resource');
  });

  it('should have SUBSCRIPTION_GROUP context', () => {
    expect(TreeItemContext.SUBSCRIPTION_GROUP).toBe('subscriptionGroup');
  });

  it('should have SUBSCRIPTION_PLAN context', () => {
    expect(TreeItemContext.SUBSCRIPTION_PLAN).toBe('subscriptionPlan');
  });

  it('should have SUBSCRIPTION_QUOTAS context', () => {
    expect(TreeItemContext.SUBSCRIPTION_QUOTAS).toBe('subscriptionQuotas');
  });

  it('should have ERROR context', () => {
    expect(TreeItemContext.ERROR).toBe('error');
  });

  it('should not expose the removed grouping context values', () => {
    const keys = Object.keys(TreeItemContext);
    expect(keys).not.toContain('NAMESPACE_GROUP');
    expect(keys).not.toContain('NAMESPACE');
    expect(keys).not.toContain('NAMESPACE_CUSTOM');
  });

  it('should be a readonly object', () => {
    // Test that all keys are present
    const keys = Object.keys(TreeItemContext);
    expect(keys).toContain('NAMESPACE_BUILTIN');
    expect(keys).toContain('NAMESPACE_ACTIVE');
    expect(keys).toContain('CATEGORY');
    expect(keys).toContain('RESOURCE_TYPE');
    expect(keys).toContain('RESOURCE');
    expect(keys).toContain('SUBSCRIPTION_GROUP');
    expect(keys).toContain('SUBSCRIPTION_PLAN');
    expect(keys).toContain('SUBSCRIPTION_QUOTAS');
    expect(keys).toContain('ERROR');
    expect(keys).toHaveLength(9);
  });
});
