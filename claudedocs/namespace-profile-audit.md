# Namespace Profile Audit — Resource Tree Filtering

**Date:** 2026-06-25
**Scope:** How the `xcsh` extension decides which resource types may be associated with a
custom namespace (and which are excluded), and a one-time audit of the misclassifications that
existed before this change.

## Background

The Resources tree splits namespaces into **Built-in** (`system`, `shared`, `default`) and
**Custom**. Within each namespace it shows only the resource types that may live there. That
decision is driven by each resource's **namespace profile** (`constraint.allowed`), e.g.
`aws_vpc_site → ["system"]` (excluded from custom), `http_loadbalancer → ["custom","default","shared"]`.

**Authoritative source of truth:** `api-specs-enriched/config/namespace_profile.yaml`. The
enrichment pipeline now also publishes it as a flat artifact, `namespace_profiles.json`
(`{ default, resources }`), which the extension consumes directly. At runtime
`isResourceTypeAvailableForNamespace` (`src/api/resourceTypes.ts`) filters the tree on
`constraint.allowed`.

## Defect (before this change)

The extension did **not** consume the authoritative map. `spec-parser.ts:extractNamespaceProfile`
recovered a per-resource profile from the enriched spec by matching a schema whose name
`startsWith(resourceKey) && includes('createspec')`. For `views.*` resources (most LBs/sites, e.g.
`viewshttp_loadbalancerCreateSpecType` — which starts with `views`, not the resource key) and any
resource whose primary schema is not a `CreateSpecType`, that match **failed** and the code
silently fell back to the **single domain-level `info` profile** — one arbitrary resource's scope
applied to an entire mixed-scope domain (e.g. the DNS domain bundles system-only `dns_zone` with
tenant-scoped `dns_load_balancer`). The result: resources leaked into custom namespaces, and some
tenant resources were hidden from them.

## Method

Both the `vscode-xcsh` and `api-specs-enriched` working trees were checked out side by side. The
enriched domain specs were assembled into the extension's layout and the authoritative map was
generated from `namespace_profile.yaml`.

- **Before:** generated `resourceTypesBase.ts` with the previous (`main`) parser, captured each
  resource's `constraint.allowed`.
- **Authoritative:** `namespace_profiles.json` — `resources[key].constraint.allowed`, falling back
  to `default` (`["custom","default","shared"]`).
- **After:** generated `resourceTypesBase.ts` with the new map-driven generator.

A resource is **wrongly available in custom** when the old output included `custom` but the
authoritative scope did not; **wrongly excluded from custom** when the reverse held.

## Results

| | Count |
|---|---|
| Total resource types | 241 |
| **Before — misclassified vs authoritative** | **27** |
| &nbsp;&nbsp;• wrongly available in custom (system/shared-only leaking in) | 11 |
| &nbsp;&nbsp;• wrongly excluded from custom (tenant resources hidden) | 16 |
| **After — misclassified vs authoritative** | **0** |

### Wrongly AVAILABLE in custom (11) — system-only, but were shown under custom namespaces

`api_definition`, `bgp_routing_policy`, `cloud_connect`, `cloud_link`, `known_label`,
`known_label_key`, `network_policy_set`, `route`, `subnet`, `tunnel`, `virtual_host`
— old: `["custom","default","shared"]` → authoritative: `["system"]`.

### Wrongly EXCLUDED from custom (16) — tenant-scoped, but were hidden from custom namespaces

`catalog`, `discovered_service`, `endpoint`, `fast_acl_rule`, `flow_anomaly`,
`listregistrationsbystate`, `network_policy`, `nfv_service`, `report_config`, `scim_token`,
`secret_management_access`, `site`, `tenant_profile`, `usb_policy`, `workload`, `workload_flavor`
— old: `["system"]` → authoritative: `["custom","default","shared"]`.

All 27 trace to the same root cause: the per-schema match failed and the resource inherited its
domain's single `info` profile.

## Fix

The authoritative `namespace_profiles.json` map is now the **single source of truth**, consumed
directly (`scripts/generators/spec-parser.ts:loadNamespaceProfiles` /
`resolveNamespaceProfile`; assigned in `resource-type-generator.ts`). The path/schema-name
derivation (`deriveNamespaceProfile`, `extractNamespaceProfile`) was **deleted** — no fallback. The
map is **required**: `generate:types` and `specs:ensure` fail loudly if it is absent. The same map
also drives `menu-schema-generator.ts`.

After the fix, generated profiles match the authoritative map for **all 241** resources (0
mismatches).

> Note: a few resources (`user`, `role`, `k8s_cluster`, `namespace_role_binding`) are not present
> in the parsed domain specs at all — a separate resource-**discovery** gap, independent of
> namespace-scope correctness, and out of scope for this audit.

## Reproduce

```bash
# extension (with the api-specs-enriched working tree available side by side)
cd vscode-xcsh
npm run specs:ensure            # syncs domains/ incl. namespace_profiles.json (required)
npm run generate:types          # fails loudly if the map is missing
npx jest                        # 1154 tests pass
```
