import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { createDiagnosticLog, observeInvoke } from './support-report.js';

/** One native engine connection. Cleanup and context watchers must not overlap another IPC exchange. */
export function serialInvoke(operation) {
  let pending = Promise.resolve();
  // Component management never shares the Java protocol stream. Status and cancellation must stay
  // usable while a large engine download or a FreshClam update is running.
  const componentCommands = new Set([
    'local_scanner_status',
    'install_local_scanner',
    'update_local_scanner_database',
    'local_scanner_preferences',
    'cancel_local_scanner_operation',
    'stop_local_scanner',
  ]);
  return (command, args) => {
    if (componentCommands.has(command)) return Promise.resolve().then(() => operation(command, args));
    const result = pending.then(() => operation(command, args));
    pending = result.catch(() => {});
    return result;
  };
}
export const diagnosticLog = createDiagnosticLog();
export const invoke = serialInvoke(observeInvoke(tauriInvoke, diagnosticLog.record));
