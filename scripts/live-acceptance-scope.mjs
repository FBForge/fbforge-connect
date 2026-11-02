// Test orchestration only. Focused UI runs never claim the separate SDK matrix.
export function acceptanceScope({ uiOnly = false, installer } = {}) {
  if (uiOnly && !installer) throw new Error('ui_only_requires_validated_installer');
  return { native: !uiOnly, desktop: Boolean(installer), uiOnly };
}

export async function exerciseAcceptance(scope, operations) {
  if (scope.native && typeof operations.native !== 'function') throw new Error('native_acceptance_missing');
  if (scope.desktop && typeof operations.desktop !== 'function')
    throw new Error('desktop_acceptance_missing');
  if (scope.native) await operations.native();
  if (scope.desktop) await operations.desktop();
  return scope.uiOnly ? 'installed_ui_only' : scope.desktop ? 'combined' : 'native_only';
}
