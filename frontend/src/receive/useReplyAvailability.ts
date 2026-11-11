import { ref, watch, onBeforeUnmount } from 'vue';
import type { Session } from '../contracts.d.ts';
import { invoke } from '../native.ts';
import { loadReplyTarget } from '../reply-sending.js';
import { diagnosticCode } from '../diagnostics.js';
import { sdkDiagnostics, type SdkDiagnostic } from '../sdk-diagnostics.ts';

type ProofIdentity = {
  proofId: string;
  destinationId: string;
  submissionId: string;
  caseId: string;
};
type Context = {
  session?: Session | null;
  proof?: ProofIdentity | null;
  reply?: boolean;
};
export type ReplyAvailability =
  | { status: 'idle' | 'pending' | 'available' }
  | { status: 'missing' | 'failed'; code: string; diagnostics?: SdkDiagnostic[] };

// This reads the native, verified reception context. It never sends a reply.
export function useReplyAvailability(context: () => Context) {
  const state = ref<ReplyAvailability>({ status: 'idle' });
  let generation = 0;
  let alive = true;
  async function check() {
    const revision = ++generation;
    const { session, proof, reply } = context();
    if (!alive || !session || !proof || reply) {
      state.value = { status: 'idle' };
      return;
    }
    state.value = { status: 'pending' };
    try {
      await loadReplyTarget(invoke, { ...session }, { ...proof });
      if (alive && revision === generation) state.value = { status: 'available' };
    } catch (cause) {
      if (!alive || revision !== generation) return;
      const code = diagnosticCode(cause);
      state.value = {
        status: code === 'reply_channel_missing' ? 'missing' : 'failed',
        code,
        diagnostics: sdkDiagnostics(cause),
      };
    }
  }
  watch(
    () => {
      const { session, proof, reply } = context();
      return `${session?.sessionId}/${session?.apiVersion}/${proof?.proofId}/${reply}`;
    },
    check,
    { immediate: true, flush: 'sync' },
  );
  onBeforeUnmount(() => {
    alive = false;
    generation++;
  });
  return { state, check };
}
