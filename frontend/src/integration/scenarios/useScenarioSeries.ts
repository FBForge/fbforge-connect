import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { invoke } from '../../native.ts';
import { useEnvironment } from '../../environments.js';
import { clone, definitionFingerprint } from './model.ts';
import { makeSeries, attachRun, entryOutcome } from './series.ts';
import { listSeries, readSeries, saveSeries, removeSeries, listRuns, scenarioError } from './storage.ts';
import { downloadLocal } from '../../local-download.js';
import type { Series, SeriesEntry } from './series.ts';
import type { Assignment, Run } from './types.ts';
import type { useScenarioWorkspace } from './useScenarioWorkspace.ts';
type Controller = ReturnType<typeof useScenarioWorkspace>;

export function useScenarioSeries(c: Controller) {
  const environment = useEnvironment();
  const series = ref<Series | null>(null),
    saved = ref<Awaited<ReturnType<typeof listSeries>>>([]);
  const choice = ref(''),
    name = ref(''),
    error = ref(''),
    pending = ref(false);
  const variants = ref<string[]>([]),
    apis = ref<('v2' | 'v3')[]>(['v3']);
  const contexts = ref<Record<string, Assignment>>({}),
    summaries = ref<Awaited<ReturnType<typeof listRuns>>>([]);
  let generation = 0,
    alive = true;
  const rows = computed(
    () =>
      series.value?.entries.map((e) => ({
        ...e,
        outcome: entryOutcome(series.value!, e, summaries.value),
        name: series.value!.definition.variants.find((v) => v.id === e.variantId)!.name,
      })) || [],
  );
  watch(
    c.definition,
    () => {
      variants.value = c.definition.value?.variants.map((v) => v.id) || [];
      if (!series.value && c.definition.value)
        name.value = `${c.definition.value.name.slice(0, 140)} · Testserie`;
    },
    { immediate: true },
  );
  watch(
    c.assignment,
    (value) => {
      contexts.value[value.apiVersion] = clone(value);
      if (!series.value) apis.value = [value.apiVersion];
    },
    { immediate: true, deep: true },
  );
  watch(c.sessionId, () => {
    generation++;
  });
  watch(environment, () => {
    generation++;
    series.value = null;
  });
  watch(
    c.history,
    () => {
      summaries.value = c.history.value;
    },
    { deep: true },
  );
  onBeforeUnmount(() => {
    generation++;
    alive = false;
  });
  function context(api: 'v2' | 'v3') {
    return (
      contexts.value[api] || {
        apiVersion: api,
        senderProfileId: '',
        receiverProfileId: '',
        sourceDestination: '',
        receiverDestination: '',
      }
    );
  }
  async function refresh(current: () => boolean) {
    const [savedRows, runRows] = await Promise.all([listSeries(invoke), listRuns(invoke)]);
    if (current()) {
      saved.value = savedRows;
      summaries.value = runRows;
    }
  }
  async function act(fn: (current: () => boolean) => Promise<void>) {
    if (pending.value || c.pending.value) return;
    const stamp = generation,
      current = () => alive && stamp === generation;
    pending.value = true;
    error.value = '';
    try {
      await fn(current);
    } catch (cause) {
      if (current()) error.value = scenarioError(cause);
    } finally {
      if (alive) pending.value = false;
    }
  }
  const create = () =>
    act(async (current) => {
      if (!c.definition.value) return;
      const value = await makeSeries(
        c.definition.value,
        variants.value,
        [...apis.value].sort().map(context),
        environment.value as Run['environment'],
        name.value,
      );
      if (!current()) return;
      await saveSeries(invoke, value);
      if (current()) {
        series.value = value;
        await refresh(current);
      }
    });
  const open = () =>
    act(async (current) => {
      const value = await readSeries(invoke, choice.value);
      if (
        value.environment !== environment.value ||
        (await definitionFingerprint(value.definition)) !== value.fingerprint
      )
        throw Error('scenario_context_changed');
      if (current()) {
        series.value = value;
        await refresh(current);
      }
    });
  async function link(id: string, value: Series, current: () => boolean) {
    if (!c.run.value || !current()) return;
    const next = await attachRun(value, id, c.run.value);
    if (!current()) return;
    await saveSeries(invoke, next);
    if (current()) {
      series.value = next;
      await refresh(current);
    }
  }
  const launch = (id: string) =>
    act(async (current) => {
      const value = series.value,
        e = value?.entries.find((e) => e.id === id);
      if (
        !value ||
        !e ||
        value.environment !== environment.value ||
        entryOutcome(value, e, summaries.value) === 'inapplicable'
      )
        return;
      const previous = c.run.value?.id;
      await c.launch(value.definition, e.variantId, e.assignment);
      if (current() && c.run.value?.id !== previous) await link(id, value, current);
    });
  const attach = (id: string) =>
    act(async (current) => {
      if (series.value) await link(id, series.value, current);
    });
  function canAttach(entry: SeriesEntry) {
    const run = c.run.value,
      value = series.value;
    return (
      !!run &&
      !!value &&
      !entry.runId &&
      run.environment === value.environment &&
      run.fingerprint === value.fingerprint &&
      run.variantId === entry.variantId &&
      !value.entries.some((row) => row.runId === run.id) &&
      (Object.keys(entry.assignment) as (keyof Assignment)[]).every(
        (key) => run.assignment[key] === entry.assignment[key],
      )
    );
  }
  const restore = (id: string) =>
    act(async () => {
      c.runChoice.value = id;
      await c.restore();
    });
  const detach = (id: string) =>
    act(async (current) => {
      if (!series.value) return;
      const value = clone(series.value),
        e = value.entries.find((e) => e.id === id);
      if (!e) return;
      e.runId = null;
      await saveSeries(invoke, value);
      if (current()) {
        series.value = value;
        await refresh(current);
      }
    });
  const remove = () =>
    act(async (current) => {
      if (!series.value) return;
      await removeSeries(invoke, series.value.id);
      if (current()) {
        series.value = null;
        choice.value = '';
        await refresh(current);
      }
    });
  const exportResults = () => {
    if (series.value)
      downloadLocal(
        JSON.stringify(
          {
            format: 'fbforge-connect-series-result',
            version: 1,
            name: series.value.name,
            fingerprint: series.value.fingerprint,
            environment: series.value.environment,
            rows: rows.value.map((r) => ({
              variant: r.name,
              variantId: r.variantId,
              entryId: r.id,
              apiVersion: r.assignment.apiVersion,
              status: r.outcome,
              runId: r.runId,
            })),
          },
          null,
          2,
        ),
        'testserie-ergebnis.json',
      );
  };
  onMounted(() => {
    void act(refresh);
  });
  return {
    environment,
    name,
    series,
    saved,
    choice,
    error,
    pending,
    variants,
    apis,
    contexts,
    rows,
    context,
    create,
    open,
    launch,
    attach,
    canAttach,
    restore,
    detach,
    remove,
    exportResults,
    refresh: () => act(refresh),
  };
}
