import { invoke } from '../native.js';
import { updateSession } from '../sessions.js';
import { selectEnvironment } from '../environments.js';
import { errorMessage } from '../diagnostics.js';

export function useEnvironmentSwitch({
  busy,
  environment,
  receiveBrowser,
  sessions,
  connections,
  caseWorkspace,
  testDraft,
  receiveTarget,
  processDraft,
  processContext,
  processSelection,
  eventTarget,
  destinationSetup,
  diagnostics,
  clearHistory,
  error,
  navigate,
}) {
  return async function changeEnvironment(value) {
    if (busy.value || value === environment.value || (await receiveBrowser.value?.confirmLeave()) === false)
      return;
    busy.value = true;
    try {
      for (const [api, session] of Object.entries(sessions.value)) {
        await updateSession(invoke, session, false);
        delete sessions.value[api];
      }
      await selectEnvironment(invoke, value);
      environment.value = value;
      connections.rememberProfile.value = false;
      connections.profileName.value = '';
      connections.clientId.value = '';
      connections.clientSecret.value = '';
      connections.profiles.value = [];
      caseWorkspace.clear();
      testDraft.value =
        receiveTarget.value =
        processDraft.value =
        processContext.value =
        processSelection.value =
          null;
      eventTarget.value = destinationSetup.value = null;
      diagnostics.results.value = {};
      clearHistory();
      error.value = '';
      void navigate('Start');
    } catch (cause) {
      error.value = errorMessage(cause);
    } finally {
      busy.value = false;
    }
  };
}
