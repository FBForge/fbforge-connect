import { invoke as tauriInvoke } from '@tauri-apps/api/core';

/** One native engine connection. Cleanup and context watchers must not overlap another IPC exchange. */
export function serialInvoke(operation) {
  let pending = Promise.resolve();
  return (command, args) => {
    const result = pending.then(() => operation(command, args));
    pending = result.catch(() => {});
    return result;
  };
}
export const invoke = serialInvoke(tauriInvoke);
