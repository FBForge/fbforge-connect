import { inject, ref } from 'vue';
export const environments = Object.freeze(['TEST', 'STAGE', 'PROD']);
export const environmentKey = Symbol('environment');
export const validEnvironment = (value) => environments.includes(value);
export const useEnvironment = () => inject(environmentKey, ref('TEST'));
export async function selectEnvironment(invoke, environment) {
  if (!validEnvironment(environment)) throw new Error('invalid_input');
  const result = await invoke('select_environment', { environment });
  if (result !== environment) throw new Error('engine_protocol_error');
  return result;
}

export const cancelledProductionAction = (cause) =>
  (typeof cause === 'string' ? cause : cause?.message) === 'content_cancelled';
