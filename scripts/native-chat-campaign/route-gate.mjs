// Copyright (c) 2026 Robin Mordasiewicz. MIT License.

export const ROUTING_CHECKS = [
  'openPanel',
  'newSession',
  'attachment',
  'existingNonXcsh',
  'cancellation',
  'reload',
  'restart',
  'multipleWindows',
];

/** Prototype selection and transport alone never satisfy packaged-core acceptance. */
export function assessCandidate(candidate) {
  const failures = [];
  if (!['automatic', 'native-default'].includes(candidate.route)) {
    failures.push('unsupported-route');
  }
  if (!['documented-command', 'public-extension-api', 'documented-native-selector'].includes(candidate.support)) {
    failures.push('unsupported-interface');
  }
  if (candidate.route === 'automatic' && candidate.support === 'documented-native-selector') {
    failures.push('manual-selection');
  }
  if (
    candidate.route === 'native-default' &&
    (!candidate.defaultControlAvailable || !candidate.defaultSetOnce || !candidate.defaultPersisted)
  ) {
    failures.push('default-unproven');
  }
  if (!candidate.identityToolInvoked) {
    failures.push('transport-unproven');
  }
  for (const check of ROUTING_CHECKS) {
    const observations = candidate.checks?.filter((observation) => observation.check === check) ?? [];
    if (!observations.length) {
      failures.push(`${check}:missing`);
    }
    if (
      check === 'multipleWindows' &&
      (new Set(observations.map((value) => value.workspaceBinding)).size < 2 ||
        new Set(observations.map((value) => value.conversationId)).size < 2)
    ) {
      failures.push('multipleWindows:insufficient');
    }
    for (const observation of observations) {
      if (
        !observation.passed ||
        !observation.workspaceBinding ||
        !observation.conversationId ||
        observation.primaryAgent !== 'xcsh' ||
        !observation.selectedModelBefore ||
        observation.selectedModelBefore !== observation.selectedModelAfter
      ) {
        failures.push(`${check}:failed`);
      }
      if (observation.usedDebuggerRouting || observation.manualSelectionRepeated) {
        failures.push(`${check}:unsupported`);
      }
      if (check === 'attachment' && observation.draftSubmitted !== false) {
        failures.push('attachment:submitted');
      }
      if (check === 'cancellation' && observation.invocationAfterCancellation !== false) {
        failures.push('cancellation:invoked');
      }
    }
  }
  return {
    classification: failures.length ? 'failed' : 'supported integration',
    prototypeRouteAccepted: failures.length === 0,
    failures: [...new Set(failures)],
  };
}

export function chooseRoute(candidates) {
  for (const route of ['automatic', 'native-default']) {
    for (const candidate of candidates.filter((value) => value.route === route)) {
      const result = assessCandidate(candidate);
      if (result.prototypeRouteAccepted) {
        return {
          route,
          deliveryGated: true,
          reason: 'packaged-core-and-release-acceptance-required',
        };
      }
    }
  }
  return { route: null, deliveryGated: true, reason: 'no-qualifying-kiro-route' };
}
