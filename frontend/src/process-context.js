import { shallowRef } from 'vue';
/** Read-only, public BPMN navigation state. It never serves as a native verification proof. */
export const processWorkspaceKey = Symbol('process-workspace');
export function createProcessWorkspace(showContext) {
  return { selection: shallowRef(null), messages: shallowRef([]), showContext };
}
