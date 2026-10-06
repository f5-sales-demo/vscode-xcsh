import type { RpcCommand } from '../types';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}
export function isInteractionCommand(value: unknown): value is RpcCommand {
  if (!record(value)) {
    return false;
  }
  if (value.type === 'interaction_snapshot') {
    return value.after === undefined || (Number.isSafeInteger(value.after) && Number(value.after) >= 0);
  }
  if (value.type === 'plan_decide') {
    return id(value.planId) && id(value.responseId) && ['implement', 'fresh', 'stay'].includes(String(value.action));
  }
  if (!id(value.requestId) || !record(value.identity)) {
    return false;
  }
  const identity = value.identity;
  if (
    ![identity.sessionId, identity.threadId, identity.turnId, identity.itemId].every(id) ||
    !Number.isSafeInteger(identity.generation) ||
    Number(identity.generation) < 0
  ) {
    return false;
  }
  return (
    value.type === 'interaction_cancel' ||
    (value.type === 'interaction_respond' && id(value.responseId) && value.value !== undefined)
  );
}
