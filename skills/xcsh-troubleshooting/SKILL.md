---
name: xcsh-troubleshooting
description:
  Guide for diagnosing xcsh issues including site health, connectivity problems,
  WAF blocks, security events, and alert investigation. Use when the user
  reports errors, wants to investigate infrastructure health, or asks about
  debugging xcsh problems.
---

# xcsh Troubleshooting

## When to Use

- User reports errors or unexpected behavior with xcsh resources
- User asks about site health, connectivity, or availability
- User wants to investigate WAF blocks or security events
- User asks about alerts or monitoring

## Diagnostic Workflow

### Step 1: Check Site Health

- Verify site status (online, degraded, offline)
- Check node health across all registered sites
- Look for recent status changes

### Step 2: Check Health Monitors

- Verify health check configuration
- Check which origins are marked healthy/unhealthy
- Review health check response times

### Step 3: Review Logs

- Check request logs for error patterns
- Look for 5xx responses, timeouts, connection resets
- Filter by time range and status code

### Step 4: Check WAF Events

- Review blocked requests
- Identify false positives vs legitimate blocks
- Check WAF policy mode (blocking vs monitoring)

### Step 5: Review Security Events

- Check for DDoS events
- Review bot defense triggers
- Look for API security violations

## Common Issues

### Site Shows as Degraded

1. Check node health — one or more nodes may be unreachable
2. Verify network connectivity to the site
3. Check for pending software upgrades

### Requests Being Blocked by WAF

1. Check WAF event logs for the specific rule triggering
2. Review the request details (headers, body, URI)
3. Consider adding an exclusion rule or switching to monitoring mode

### Origin Pool Shows All Unhealthy

1. Verify the health check endpoint is reachable from F5 XC PoPs
2. Check the health check timeout and interval settings
3. Verify origin server firewall allows F5 XC source IPs

### High Latency

1. Check origin server response times via health check metrics
2. Review CDN cache hit ratios
3. Check for geographic routing mismatches
