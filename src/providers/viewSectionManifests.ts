// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

/**
 * Curated section manifests for the resource describe/view panel.
 *
 * The spec-driven engine (see `GENERATED_VIEW_LAYOUTS`) renders every resource with
 * labelled, ordered fields derived from the OpenAPI specs. That gives correct field
 * coverage everywhere, but the F5 XC console groups fields into named tabs
 * ("Domains and LB Type", "Origins", "Common Security Controls", …) that are NOT
 * expressed in the specs — they are the console front-end's own aggregation.
 *
 * A manifest is a hand-authored overlay for a single resource type: it maps each
 * console section title to the ordered list of top-level spec keys it contains. The
 * renderer builds sections in this order; any present spec key not named here is
 * appended to a trailing "Other Settings" section so coverage is never silently lost.
 * `labelOverrides` supplies human labels for keys whose spec schema lacks an
 * `x-displayname` (e.g. `auto_cert_info`).
 *
 * Only high-value resource types need a manifest; everything else uses the
 * spec-derived grouping automatically.
 */

/** A single console section: a title and the top-level spec keys it groups. */
export interface ManifestSection {
  /** Stable id used for the section anchor */
  id: string;
  /** Console section title */
  title: string;
  /** Top-level spec keys belonging to this section, in display order */
  keys: string[];
}

/** Curated layout overlay for one resource type. */
export interface ViewSectionManifest {
  sections: ManifestSection[];
  /** Labels for spec keys lacking an x-displayname (keyed by spec key) */
  labelOverrides?: Record<string, string>;
}

export const VIEW_SECTION_MANIFESTS: Record<string, ViewSectionManifest> = {
  http_loadbalancer: {
    sections: [
      {
        id: 'domains-lb-type',
        title: 'Domains and LB Type',
        keys: [
          'domains',
          'https_auto_cert',
          'https',
          'http',
          'advertise_on_public',
          'advertise_on_public_default_vip',
          'advertise_custom',
          'do_not_advertise',
        ],
      },
      {
        id: 'origins',
        title: 'Origins',
        keys: ['default_route_pools', 'default_pool', 'default_pool_list', 'origin_server_subset_rule_list', 'routes'],
      },
      {
        id: 'waf',
        title: 'Web Application Firewall',
        keys: ['app_firewall', 'disable_waf', 'waf_exclusion'],
      },
      {
        id: 'bot-protection',
        title: 'Bot Protection',
        keys: ['bot_defense', 'bot_defense_advanced', 'disable_bot_defense'],
      },
      {
        id: 'api-protection',
        title: 'API Protection',
        keys: [
          'api_protection_rules',
          'api_specification',
          'api_testing',
          'disable_api_testing',
          'enable_api_discovery',
          'disable_api_discovery',
          'disable_api_definition',
          'api_rate_limit',
          'jwt_validation',
        ],
      },
      {
        id: 'malware-protection',
        title: 'Malware Protection',
        keys: ['malware_protection_settings', 'disable_malware_protection'],
      },
      {
        id: 'dos-settings',
        title: 'DoS Settings',
        keys: [
          'ddos_mitigation_rules',
          'l7_ddos_protection',
          'l7_ddos_action_default',
          'l7_ddos_action_block',
          'l7_ddos_action_js_challenge',
          'slow_ddos_mitigation',
          'single_lb_app',
          'multi_lb_app',
        ],
      },
      {
        id: 'client-side-defense',
        title: 'Client-Side Defense',
        keys: ['client_side_defense', 'disable_client_side_defense'],
      },
      {
        id: 'common-security-controls',
        title: 'Common Security Controls',
        keys: [
          'cors_policy',
          'csrf_policy',
          'data_guard_rules',
          'graphql_rules',
          'sensitive_data_policy',
          'default_sensitive_data_policy',
          'sensitive_data_disclosure_rules',
          'protected_cookies',
          'trusted_clients',
          'blocked_clients',
          'rate_limit',
          'disable_rate_limit',
          'enable_ip_reputation',
          'disable_ip_reputation',
          'enable_malicious_user_detection',
          'disable_malicious_user_detection',
          'user_identification',
          'user_id_client_ip',
          'enable_threat_mesh',
          'disable_threat_mesh',
          'enable_trust_client_ip_headers',
          'disable_trust_client_ip_headers',
          'active_service_policies',
          'no_service_policies',
          'service_policies_from_namespace',
          'policy_based_challenge',
          'js_challenge',
          'captcha_challenge',
          'enable_challenge',
          'no_challenge',
          'caching_policy',
          'disable_caching',
        ],
      },
      {
        id: 'other-settings',
        title: 'Other Settings',
        keys: [
          'more_option',
          'system_default_timeouts',
          'add_location',
          'cookie_stickiness',
          'source_ip_stickiness',
          'round_robin',
          'least_active',
          'random',
          'ring_hash',
          'internet_vip_info',
        ],
      },
      { id: 'host-name', title: 'Host Name', keys: ['host_name'] },
      { id: 'dns-information', title: 'DNS Information', keys: ['dns_info'] },
      { id: 'virtual-host-state', title: 'Virtual Host State', keys: ['state'] },
      { id: 'auto-cert-state', title: 'Auto Cert State', keys: ['auto_cert_info'] },
      { id: 'cert-state', title: 'Cert State', keys: ['cert_state'] },
    ],
    labelOverrides: {
      http: 'HTTP',
      https: 'HTTPS',
      https_auto_cert: 'HTTPS with Automatic Certificate',
      app_firewall: 'Application Firewall',
      default_pool: 'Origin Pool',
      auto_cert_info: 'Auto Cert State',
      cert_state: 'Cert State',
      state: 'Virtual Host State',
      host_name: 'Host Name',
    },
  },

  origin_pool: {
    sections: [
      { id: 'origin-servers', title: 'Origin Servers', keys: ['origin_servers'] },
      {
        id: 'port-config',
        title: 'Port Configuration',
        keys: ['port', 'automatic_port', 'lb_port', 'same_as_endpoint_port', 'health_check_port'],
      },
      { id: 'tls', title: 'TLS', keys: ['use_tls', 'no_tls'] },
      { id: 'health-check', title: 'Health Check', keys: ['healthcheck'] },
      {
        id: 'load-balancing',
        title: 'Load Balancing',
        keys: ['loadbalancer_algorithm', 'endpoint_selection', 'upstream_conn_pool_reuse_type', 'advanced_options'],
      },
    ],
    labelOverrides: {
      use_tls: 'TLS',
      no_tls: 'No TLS',
      automatic_port: 'Automatic Port',
      lb_port: 'LB Port',
      same_as_endpoint_port: 'Same as Endpoint Port',
      loadbalancer_algorithm: 'Load Balancer Algorithm',
      endpoint_selection: 'Endpoint Selection',
      advanced_options: 'Advanced Options',
    },
  },

  app_firewall: {
    sections: [
      { id: 'enforcement-mode', title: 'Enforcement Mode', keys: ['blocking', 'monitoring'] },
      {
        id: 'security-policy-settings',
        title: 'Security Policy Settings',
        keys: [
          'detection_settings',
          'default_detection_settings',
          'default_bot_setting',
          'bot_protection_setting',
          'enable_ai_enhancements',
          'disable_ai_enhancements',
        ],
      },
      {
        id: 'advanced-configuration',
        title: 'Advanced configuration',
        keys: [
          'allowed_response_codes',
          'allow_all_response_codes',
          'blocking_page',
          'use_default_blocking_page',
          'default_anonymization',
          'custom_anonymization',
          'disable_anonymization',
        ],
      },
    ],
    labelOverrides: {
      blocking: 'Blocking',
      monitoring: 'Monitoring',
      detection_settings: 'Detection Settings',
      default_detection_settings: 'Default Detection Settings',
      default_bot_setting: 'Signature-Based Bot Protection',
      bot_protection_setting: 'Bot Protection Setting',
      enable_ai_enhancements: 'Enhance with AI',
      disable_ai_enhancements: 'AI Enhancements',
      blocking_page: 'Blocking Page',
      use_default_blocking_page: 'Default Blocking Page',
      default_anonymization: 'Default Anonymization',
      custom_anonymization: 'Custom Anonymization',
      disable_anonymization: 'Anonymization',
    },
  },

  service_policy: {
    sections: [
      {
        id: 'servers',
        title: 'Servers',
        keys: ['any_server', 'server_name', 'server_name_matcher', 'server_selector'],
      },
      {
        id: 'rules',
        title: 'Rules',
        keys: ['rule_list', 'legacy_rule_list', 'allow_list', 'deny_list', 'allow_all_requests', 'deny_all_requests'],
      },
    ],
    labelOverrides: {
      any_server: 'Any Server',
      server_name: 'Server Name',
      server_name_matcher: 'Server Name Matcher',
      server_selector: 'Server Selector',
      rule_list: 'Custom Rule List',
      legacy_rule_list: 'Legacy Rule List',
      allow_list: 'Allow List',
      deny_list: 'Deny List',
      allow_all_requests: 'Allow All Requests',
      deny_all_requests: 'Deny All Requests',
    },
  },

  tcp_loadbalancer: {
    sections: [
      {
        id: 'basic-configuration',
        title: 'Basic Configuration',
        keys: [
          'domains',
          'listen_port',
          'port_ranges',
          'sni',
          'no_sni',
          'default_lb_with_sni',
          'dns_volterra_managed',
          'origin_pools_weights',
          'advertise_on_public',
          'advertise_on_public_default_vip',
          'advertise_custom',
          'do_not_advertise',
        ],
      },
      {
        id: 'load-balancing-control',
        title: 'Load Balancing Control',
        keys: [
          'tcp',
          'tls_tcp',
          'tls_tcp_auto_cert',
          'hash_policy_choice_round_robin',
          'hash_policy_choice_least_active',
          'hash_policy_choice_random',
          'hash_policy_choice_source_ip_stickiness',
        ],
      },
      {
        id: 'service-policies',
        title: 'Service Policies',
        keys: ['active_service_policies', 'no_service_policies', 'service_policies_from_namespace'],
      },
      {
        id: 'advanced-configuration',
        title: 'Advanced Configuration',
        keys: ['idle_timeout', 'do_not_retract_cluster', 'retract_cluster', 'internet_vip_info'],
      },
      { id: 'host-name', title: 'Host Name', keys: ['host_name'] },
      { id: 'dns-information', title: 'DNS Information', keys: ['dns_info'] },
      { id: 'auto-cert-state', title: 'Auto Cert State', keys: ['auto_cert_info'] },
      { id: 'cert-state', title: 'Cert State', keys: ['cert_state'] },
    ],
    labelOverrides: {
      tcp: 'TCP',
      tls_tcp: 'TLS TCP',
      tls_tcp_auto_cert: 'TLS TCP with Automatic Certificate',
      sni: 'SNI',
      no_sni: 'No SNI',
      default_lb_with_sni: 'Default LB with SNI',
      listen_port: 'Listen Port',
      advertise_on_public: 'Advertise On Public',
      advertise_on_public_default_vip: 'Advertise On Public (Default VIP)',
      advertise_custom: 'Advertise Custom',
      do_not_advertise: 'Do Not Advertise',
      hash_policy_choice_round_robin: 'Round Robin',
      hash_policy_choice_least_active: 'Least Active',
      hash_policy_choice_random: 'Random',
      hash_policy_choice_source_ip_stickiness: 'Source IP Stickiness',
      active_service_policies: 'Active Service Policies',
      no_service_policies: 'No Service Policies',
      service_policies_from_namespace: 'Apply Namespace Service Policies',
      do_not_retract_cluster: 'Do Not Retract Cluster',
      retract_cluster: 'Retract Cluster',
      auto_cert_info: 'Auto Cert State',
      cert_state: 'Cert State',
    },
  },

  cdn_loadbalancer: {
    sections: [
      {
        id: 'basic-configuration',
        title: 'Basic Configuration',
        keys: ['domains', 'service_domains', 'https_auto_cert', 'https', 'http'],
      },
      { id: 'cdn-origin-pool', title: 'CDN Origin Pool', keys: ['origin_pool'] },
      { id: 'caching-policies', title: 'Caching Policies', keys: ['default_cache_action', 'custom_cache_rule'] },
      { id: 'waf', title: 'Web Application Firewall', keys: ['app_firewall', 'disable_waf', 'waf_exclusion'] },
      {
        id: 'api-protection',
        title: 'API Protection',
        keys: [
          'api_specification',
          'api_rate_limit',
          'disable_api_definition',
          'enable_api_discovery',
          'disable_api_discovery',
          'jwt_validation',
        ],
      },
      {
        id: 'dos-protection',
        title: 'DoS Protection',
        keys: [
          'ddos_mitigation_rules',
          'l7_ddos_action_default',
          'l7_ddos_action_block',
          'l7_ddos_action_js_challenge',
          'slow_ddos_mitigation',
        ],
      },
      {
        id: 'common-security-controls',
        title: 'Common Security Controls',
        keys: [
          'bot_defense',
          'client_side_defense',
          'disable_client_side_defense',
          'cors_policy',
          'csrf_policy',
          'data_guard_rules',
          'sensitive_data_policy',
          'default_sensitive_data_policy',
          'protected_cookies',
          'trusted_clients',
          'blocked_clients',
          'rate_limit',
          'disable_rate_limit',
          'enable_ip_reputation',
          'disable_ip_reputation',
          'enable_malicious_user_detection',
          'disable_malicious_user_detection',
          'enable_threat_mesh',
          'disable_threat_mesh',
          'user_identification',
          'user_id_client_ip',
          'js_challenge',
          'captcha_challenge',
          'policy_based_challenge',
          'enable_challenge',
          'no_challenge',
          'graphql_rules',
          'active_service_policies',
          'no_service_policies',
          'service_policies_from_namespace',
        ],
      },
      { id: 'other-settings', title: 'Other Settings', keys: ['other_settings', 'system_default_timeouts'] },
      { id: 'host-name', title: 'Host Name', keys: ['host_name'] },
      { id: 'dns-information', title: 'DNS Information', keys: ['dns_info'] },
      { id: 'virtual-host-state', title: 'Virtual Host State', keys: ['state'] },
      { id: 'auto-cert-state', title: 'Auto Cert State', keys: ['auto_cert_info'] },
      { id: 'cert-state', title: 'Cert State', keys: ['cert_state'] },
    ],
    labelOverrides: {
      http: 'HTTP',
      https: 'HTTPS',
      https_auto_cert: 'HTTPS with Automatic Certificate',
      origin_pool: 'CDN Origin Pool',
      default_cache_action: 'Default Cache Action',
      custom_cache_rule: 'Custom Cache Rules',
      app_firewall: 'Application Firewall',
      other_settings: 'Other Settings',
      auto_cert_info: 'Auto Cert State',
      cert_state: 'Cert State',
      state: 'Virtual Host State',
    },
  },
};
