---
name: xcsh-resource-management
description:
  Guide for creating, updating, listing, and deleting xcsh resources including
  HTTP load balancers, origin pools, health checks, WAF policies, and service
  policies. Use when the user wants to manage xcsh infrastructure or asks about
  creating, configuring, or deploying xcsh resources.
---

# xcsh Resource Management

## When to Use

- User wants to create, update, list, or delete xcsh resources
- User asks about load balancers, origin pools, health checks, WAF policies
- User references F5 Distributed Cloud infrastructure

## Core Workflow

1. **Identify the resource type** from the user's request
2. **Check active context** — ensure an xcsh context is configured with the
   correct namespace
3. **Use xcsh** to perform the operation via the F5 Distributed Cloud API

## Resource Types

### HTTP Load Balancer

- Primary resource for exposing applications
- Requires: name, domains, routes or default route with origin pool
- See [example config](./examples/http-load-balancer.yaml)

### Origin Pool

- Backend server group that load balancers route traffic to
- Requires: name, origin servers (IP or DNS), port
- See [example config](./examples/origin-pool.yaml)

### Health Check

- Monitors origin server availability
- Requires: name, protocol (HTTP/TCP), interval
- See [example config](./examples/health-check.yaml)

### WAF Policy (App Firewall)

- Web Application Firewall rules
- Requires: name, mode (blocking/monitoring)

### Service Policy

- Layer 7 access control rules
- Requires: name, rules with match conditions and actions

## Common Patterns

### Create Load Balancer with Origin Pool

1. Create health check
2. Create origin pool referencing the health check
3. Create HTTP load balancer referencing the origin pool

### Namespace Scoping

All resources are scoped to a namespace. Use the active context's namespace or
specify explicitly.

## API Spec Extensions

When working with xcsh configurations, these enrichment extensions provide
guidance:

- `x-f5xc-minimum-configuration` — minimum required fields for resource creation
- `x-f5xc-required-for` — which fields are required for create/update/read
  operations
- `x-f5xc-conflicts-with` — mutually exclusive fields (setting one means you
  cannot set another)
- `x-f5xc-recommended-oneof-variant` — which oneOf variant to default to
