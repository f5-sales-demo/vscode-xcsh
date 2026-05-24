---
name: f5xc-configuration-authoring
description:
  Guide for writing F5 Distributed Cloud configuration files in JSON or YAML,
  understanding field relationships, resolving oneOf conflicts, and building
  minimum viable configurations. Use when the user is writing or editing F5 XC
  config files or asks about field requirements and relationships.
---

# F5 XC Configuration Authoring

## When to Use

- User is writing or editing F5 XC configuration files (JSON or YAML)
- User asks about required fields or field relationships
- User encounters validation errors in F5 XC configs
- User wants to understand oneOf choices or mutual exclusivity

## Configuration Structure

Every F5 XC resource configuration follows this structure:

```yaml
metadata:
  name: resource-name # Required: kebab-case identifier
  namespace: namespace-name # Required: target namespace
  labels: {} # Optional: key-value labels
  annotations: {} # Optional: key-value annotations
spec:
  # Resource-specific fields
```

## Using API Spec Extensions

### Minimum Configuration (`x-f5xc-minimum-configuration`)

Shows the absolute minimum fields needed to create a resource. Start here and
add fields as needed.

### Required Fields (`x-f5xc-required-for`)

Each field has flags for when it's required:

- `create: true` — must be present when creating the resource
- `update: true` — must be present when updating
- `minimum_config: true` — part of the minimum viable configuration

### Mutual Exclusivity (`x-f5xc-conflicts-with`)

Fields that cannot be set together. For example:

- `active_service_policies` conflicts with `no_service_policies` and
  `service_policies_from_namespace`
- Setting one means you MUST NOT set the others

### OneOf Variants (`x-f5xc-recommended-oneof-variant`)

When a field uses oneOf (choose exactly one option), this extension tells you
which variant is the recommended default.

## Common Patterns

### TLS Configuration

Most load balancers need TLS. The oneOf choice is between:

- `http` — plain HTTP (development only)
- `https_auto_cert` — automatic certificate management (recommended)
- `https` — manual certificate configuration

### Origin Server Types

Origin pools support multiple origin types:

- `public_ip` — direct IP address
- `public_name` — DNS hostname
- `private_ip` — internal IP (requires site)
- `private_name` — internal DNS (requires site)
- `k8s_service` — Kubernetes service reference

## Validation Tips

1. Check `x-f5xc-conflicts-with` before combining fields
2. Use `x-f5xc-minimum-configuration` as your starting template
3. For oneOf fields, pick exactly one variant
4. All names must be kebab-case (lowercase, hyphens, no underscores)
5. Namespace references must match existing namespaces
