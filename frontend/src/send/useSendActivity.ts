import type { Ref } from 'vue';
import type { Session, SendOutcome, ActivityEvent } from '../contracts.ts';
import { resetsSessions } from '../sessions.js';

interface ActivityContext {
  props: { readonly busy: boolean; readonly session?: Session | null };
  emit: {
    (event: 'busy', value: boolean): void;
    (event: 'activity', value: ActivityEvent): void;
    (event: 'fatal'): void;
  };
  explain: (cause: unknown) => string;
  state: {
    working: Ref<boolean>;
    actionOpener: Ref<Element | null>;
    error: Ref<string>;
    confirmedSession: Ref<Session | null>;
    outcome: Ref<SendOutcome | null>;
    progress: Ref<string>;
  };
}

// Owns busy/error reporting for a single user-triggered send operation.
export function useSendActivity({ props, emit, explain, state }: ActivityContext) {
  const { working, actionOpener, error, confirmedSession, outcome, progress } = state;
  async function act(action: string, operation: () => Promise<unknown>): Promise<void> {
    if (working.value || props.busy) return;
    actionOpener.value = document.activeElement;
    working.value = true;
    emit('busy', true);
    error.value = '';
    const started = performance.now(),
      active = props.session ? { ...props.session } : confirmedSession.value;
    let status = 'Erfolgreich';
    try {
      await operation();
      if (outcome.value?.status === 'uncertain') status = 'Ausgang ungewiss';
      else if (outcome.value?.status === 'failed') status = 'Fehlgeschlagen';
    } catch (cause) {
      const cancelled =
        (typeof cause === 'string'
          ? cause
          : cause && typeof cause === 'object' && 'message' in cause
            ? cause.message
            : undefined) === 'content_cancelled';
      status = cancelled ? 'Abgebrochen' : 'Fehlgeschlagen';
      if (!cancelled) error.value = explain(cause);
      if (resetsSessions(cause)) emit('fatal');
    } finally {
      working.value = false;
      emit('busy', false);
      progress.value = '';
      emit('activity', {
        api: active?.apiVersion,
        role: active?.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
        action,
        status,
        started,
      });
    }
  }
  return { act };
}
