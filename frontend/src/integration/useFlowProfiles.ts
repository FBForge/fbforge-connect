import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { invoke } from '../native.ts';
import { copyProfileForApi, listProfiles } from '../profiles.ts';
import type { Environment, FlowAssignment, SavedProfile } from '../contracts.d.ts';

// Resolves a selected profile to the target API through the protected native store.
// Credentials never enter the webview; merely listing profiles never copies them.
export function useFlowProfiles(
  props: { context: FlowAssignment; environment: Environment; disabled?: boolean },
  update: (context: FlowAssignment) => void,
) {
  const all = ref<readonly SavedProfile[]>([]),
    pending = ref(false),
    error = ref('');
  let generation = 0;
  const counterparts = (profile: SavedProfile) =>
    all.value.filter(
      (p) =>
        p.apiVersion === props.context.apiVersion &&
        p.clientId === profile.clientId &&
        p.role === profile.role,
    );
  const profiles = computed(() =>
    all.value.filter((p) => p.apiVersion === props.context.apiVersion || counterparts(p).length !== 1),
  );
  async function load() {
    const stamp = ++generation;
    pending.value = true;
    error.value = '';
    try {
      const value = await listProfiles(invoke);
      if (stamp === generation)
        all.value = value.filter((p) => p.available && p.environment === props.environment);
    } catch {
      if (stamp === generation)
        error.value =
          'Profile konnten nicht geladen werden. Laden Sie die Liste erneut oder verbinden Sie manuell.';
    } finally {
      if (stamp === generation) pending.value = false;
    }
  }
  async function select(side: 'sender' | 'receiver', event: Event) {
    if (!(event.target instanceof HTMLSelectElement) || props.disabled || pending.value) return;
    const selected = all.value.find((p) => p.profileId === (event.target as HTMLSelectElement).value);
    const stamp = generation,
      api = props.context.apiVersion;
    error.value = '';
    pending.value = true;
    try {
      let profile = selected;
      if (profile && profile.apiVersion !== api) {
        const targets = counterparts(profile);
        if (targets.length > 1) throw Error('profile_api_ambiguous');
        profile = await copyProfileForApi(invoke, profile, api, targets[0]?.profileId);
        if (stamp === generation)
          all.value = [...all.value.filter((p) => p.profileId !== profile!.profileId), profile];
      }
      if (stamp === generation) update({ ...props.context, [`${side}ProfileId`]: profile?.profileId || '' });
    } catch (cause) {
      if (stamp === generation)
        error.value =
          cause instanceof Error && cause.message === 'profile_api_ambiguous'
            ? 'Mehrere Profile passen zu dieser API. Wählen Sie das gewünschte Profil direkt aus.'
            : 'Das Profil konnte für diese API nicht vorbereitet werden. Prüfen Sie die Verbindung und versuchen Sie es erneut.';
    } finally {
      if (stamp === generation) pending.value = false;
    }
  }
  watch(
    () => [props.environment, props.context.apiVersion],
    () => {
      all.value = [];
      void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    generation++;
  });
  return { profiles, pending, error, load, select };
}
