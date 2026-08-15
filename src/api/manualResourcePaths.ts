// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Explicit collection paths for resources intentionally supported without a
 * canonical API.Create operation. The generator requires this map to match the
 * upstream resource_coverage.json manual disposition set exactly.
 */
export const MANUAL_RESOURCE_PATHS = {
  api_credential: '/api/web/namespaces/{namespace}/api_credentials',
  api_group: '/api/web/namespaces/{namespace}/api_groups',
  bigip_virtual_server: '/api/config/namespaces/{namespace}/bigip_virtual_servers',
  bot_allowlist_policy: '/api/shape/bot/namespaces/{namespace}/bot_allowlist_policys',
  bot_detection_rule: '/api/shape/bot/namespaces/{namespace}/bot_detection_rules',
  bot_endpoint_policy: '/api/shape/bot/namespaces/{namespace}/bot_endpoint_policys',
  bot_network_policy: '/api/shape/bot/namespaces/{namespace}/bot_network_policys',
  discovered_service: '/api/discovery/namespaces/{namespace}/discovered_services',
  flow_anomaly: '/api/config/namespaces/{namespace}/flow_anomalys',
  infraprotect_firewall_ruleset: '/api/infraprotect/namespaces/{namespace}/infraprotect_firewall_rulesets',
  lma_region: '/api/config/namespaces/{namespace}/lma_regions',
  nginx_csg: '/api/config/namespaces/{namespace}/nginx_csgs',
  nginx_instance: '/api/config/namespaces/{namespace}/nginx_instances',
  nginx_server: '/api/config/namespaces/{namespace}/nginx_servers',
  service_credential: '/api/web/namespaces/{namespace}/service_credentials',
  shape_bot_defense_instance: '/api/config/namespaces/{namespace}/shape_bot_defense_instances',
  user: '/api/web/custom/namespaces/{namespace}/user_roles',
} as const;
