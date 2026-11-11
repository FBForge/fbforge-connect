import { registerPreparationFlush } from './preparation-flush.ts';
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { Ref } from 'vue';
import type { useScenarioWorkspace } from './useScenarioWorkspace.ts';
import { invoke } from '../../native.ts';
import { useEnvironment } from '../../environments.js';
import { clone } from './model.ts';
import { scenarioError } from './storage.ts';
import { readPreparation, savePreparation, deletePreparation } from './recovery.ts';
import type { Preparation } from './recovery.ts';
export function usePreparationRecovery(c: ReturnType<typeof useScenarioWorkspace>, editorBusy: Ref<boolean>) {
  const environment = useEnvironment().value as Preparation['environment'];
  const enabled = ref(true),
    found = ref<Preparation | null>(null),
    state = ref('idle'),
    error = ref(''),
    savedAt = ref('');
  let alive = true,
    reading = false,
    readFailed = false,
    revision = 0,
    savedRevision = -1;
  let timer: ReturnType<typeof setTimeout> | undefined,
    queue = Promise.resolve(),
    initialRead: Promise<void>;
  function cancelTimer() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  async function load() {
    reading = true;
    error.value = '';
    try {
      const value = await readPreparation(invoke, environment);
      found.value = value;
      readFailed = false;
    } catch (cause) {
      readFailed = true;
      state.value = 'error';
      error.value = `Die bisherige Vorbereitung konnte nicht gelesen werden. Sie wird nicht überschrieben. ${scenarioError(cause)}`;
    } finally {
      reading = false;
    }
  }
  function capture(): Preparation | null {
    return c.definition.value && (!c.run.value || c.tab.value === 'prepare')
      ? {
          format: 'fbforge-connect-preparation',
          version: 1,
          definition: clone(c.definition.value),
          assignment: clone(c.assignment.value),
          variantId: c.variant.value,
          environment,
          savedAt: new Date().toISOString(),
        }
      : null;
  }
  async function flush() {
    cancelTimer();
    await initialRead;
    if (editorBusy.value) throw Error('preparation_pending');
    if (readFailed) throw Error('preparation_unavailable');
    if (!enabled.value || found.value || !c.definition.value || revision === savedRevision) {
      await queue;
      return;
    }
    const document = capture();
    if (!document) {
      await queue;
      return;
    }
    const stamp = revision;
    state.value = 'saving';
    queue = queue
      .catch(() => {})
      .then(async () => {
        try {
          await savePreparation(invoke, document);
          savedRevision = stamp;
          if (alive && revision === stamp) {
            state.value = 'saved';
            savedAt.value = document.savedAt;
            error.value = '';
          }
        } catch (cause) {
          if (alive) {
            state.value = 'error';
            error.value = `Vorbereitung noch nicht gesichert. ${scenarioError(cause)}`;
          }
          throw cause;
        }
      });
    await queue;
  }
  function schedule() {
    revision++;
    cancelTimer();
    if (!enabled.value || reading || found.value || readFailed || !capture()) return;
    state.value = 'unsaved';
    timer = setTimeout(() => {
      void flush().catch(() => {});
    }, 750);
  }
  watch([c.definition, c.assignment, c.variant], schedule, { deep: true });
  watch(editorBusy, (busy) => {
    if (!busy) schedule();
  });
  async function removeSnapshot(force = false) {
    cancelTimer();
    await initialRead;
    if (!force && (found.value || readFailed)) return;
    const stamp = revision;
    await queue.catch(() => {});
    await deletePreparation(invoke, environment);
    found.value = null;
    readFailed = false;
    error.value = '';
    savedAt.value = '';
    state.value = 'clean';
    savedRevision = stamp;
    if (revision !== stamp) schedule();
  }
  const clear = () => removeSnapshot();
  const discard = () => removeSnapshot(true);
  function restore() {
    const value = found.value;
    if (!value) return;
    c.run.value = null;
    c.definition.value = clone(value.definition);
    c.assignment.value = clone(value.assignment);
    c.variant.value = value.variantId;
    c.tab.value = 'prepare';
    found.value = null;
    savedAt.value = value.savedAt;
    state.value = 'saved';
  }
  watch(enabled, (value) => {
    if (!value)
      void discard().catch((cause) => {
        error.value = scenarioError(cause);
      });
    else schedule();
  });
  const unregister = registerPreparationFlush(flush);
  onMounted(() => {
    initialRead = load();
  });
  // Initialized before lifecycle registration can be used by a close event.
  initialRead = Promise.resolve();
  onBeforeUnmount(() => {
    void flush().catch(() => {});
    alive = false;
    cancelTimer();
    unregister();
  });
  return { enabled, found, state, error, savedAt, flush, clear, discard, restore, retry: load };
}
