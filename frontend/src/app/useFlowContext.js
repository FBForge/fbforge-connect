export function useFlowContext({
  busy,
  connections,
  environment,
  error,
  activeSession,
  storageStatus,
  apiVersion,
  selectedDestination,
  defaultDestinations,
  testDraft,
  receiveTab,
  navigate,
  beforeChange = async () => true,
}) {
  return async function openFlowContext(context) {
    if (busy.value) return;
    const side = context.side;
    const profileId = context[`${side}ProfileId`];
    if (profileId) {
      await connections.refreshProfiles();
      const profile = connections.profiles.value.find(
        (item) =>
          item.profileId === profileId &&
          item.environment === environment.value &&
          item.apiVersion === context.apiVersion,
      );
      if (!profile) {
        error.value = 'Das zugeordnete Profil ist in dieser Umgebung nicht verfügbar.';
        return;
      }
      if (!(await connections.connectProfile(profile, true, context.apiVersion))) return;
      if (storageStatus.value?.profileId !== profileId || !activeSession.value) return;
    } else if (apiVersion.value !== context.apiVersion) await connections.changeApi(context.apiVersion);
    else if ((await beforeChange()) === false) return;
    if (busy.value || apiVersion.value !== context.apiVersion) return;
    if (side === 'receiver' && context.receiverDestination)
      selectedDestination.value = context.receiverDestination;
    if (side === 'sender' && context.sourceDestination)
      defaultDestinations.value = {
        ...defaultDestinations.value,
        sourceDestination: context.sourceDestination,
      };
    if (side === 'sender' && context.receiverDestination)
      testDraft.value = testDraft.value
        ? { ...testDraft.value, destinationId: context.receiverDestination }
        : testDraft.value;
    if (side === 'sender' && context.step === 'check_reply') receiveTab.value = 'replies';
    if (!activeSession.value) connections.showConnection();
    await navigate(side === 'sender' && context.step !== 'check_reply' ? 'Senden' : 'Empfangen');
  };
}
