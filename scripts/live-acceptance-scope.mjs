// Test orchestration only. Focused UI runs never claim the separate SDK matrix.
export function acceptanceScope({ uiOnly = false, installer, baseOnly = false, reviewOnly = false } = {}) {
  if (uiOnly && !installer) throw new Error('ui_only_requires_validated_installer');
  if (baseOnly && (!uiOnly || !installer || reviewOnly))
    throw new Error('base_only_requires_validated_ui_only_without_review');
  return { native: !uiOnly, desktop: Boolean(installer), uiOnly, baseOnly };
}

export async function exerciseAcceptance(scope, operations) {
  if (scope.native && typeof operations.native !== 'function') throw new Error('native_acceptance_missing');
  if (scope.desktop && typeof operations.desktop !== 'function')
    throw new Error('desktop_acceptance_missing');
  if (scope.native) await operations.native();
  if (scope.desktop) await operations.desktop();
  return scope.baseOnly
    ? 'installed_ui_base_only'
    : scope.uiOnly
      ? 'installed_ui_only'
      : scope.desktop
        ? 'combined'
        : 'native_only';
}
