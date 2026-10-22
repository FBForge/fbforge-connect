import { ref, shallowRef, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { invoke } from '../native.js';
import {
  loadEventLog,
  loadReplyEventLog,
  loadCaseEventLog,
  listEventLog,
  readEventDocument,
  discardEventLog,
} from '../event-log.js';
import { errorMessage, diagnosticCode } from '../diagnostics.js';
import { resetsSessions } from '../sessions.js';

// Owns event log panel state and its session-bound lifecycle.
export function useEventLogPanel(props, emit) {
  const diagnostic = ref('');
  const recent = computed(() =>
    (props.knownTargets || []).filter(
      (item) => item.sessionId === props.session?.sessionId && item.apiVersion === props.session?.apiVersion,
    ),
  );
  const mode = ref('case'),
    replyId = ref('');
  const destination = ref(''),
    caseId = ref(''),
    submission = ref('');
  const result = shallowRef(null),
    events = shallowRef([]),
    preview = shallowRef(null);
  const pending = ref(false),
    error = ref(''),
    query = ref(''),
    page = ref(0),
    heading = ref(null);
  const context = computed(() => `${props.session?.apiVersion || ''}/${props.session?.sessionId || ''}`);
  const disabled = computed(() => props.busy || pending.value || !props.session);
  const filtered = computed(() => {
    const term = query.value.trim().toLowerCase();
    return events.value.filter(
      (event) =>
        !term ||
        [
          name(event),
          event.eventType,
          event.eventId,
          event.issuer,
          event.issuedAt,
          event.subjectId || '',
          event.subjectType || '',
        ].some((value) => value.toLowerCase().includes(term)),
    );
  });
  const shown = computed(() => filtered.value.slice(page.value * 20, page.value * 20 + 20));
  let generation = 0,
    owner,
    controller,
    alive = true;
  const messages = {
    verification_failed:
      'Der Event Log konnte nicht vollständig verifiziert werden. Es wird kein Prüfergebnis übernommen.',
    invalid_resource:
      'Die Antwort ist unvollständig oder das lokale Ergebnis nicht mehr verfügbar. Bitte den Event Log erneut laden.',
    resource_missing: 'Für diese Kennungen ist kein abrufbarer Event Log vorhanden.',
    resource_denied: 'Diese Zugangsdaten dürfen den angefragten Event Log nicht lesen.',
    resource_unavailable:
      'Der Event Log konnte nicht geladen werden. Nach einem lokalen Bereinigungsfehler bitte abmelden und eine neue Sitzung öffnen.',
    content_limit: 'Der Event Log überschreitet die zulässige Größe oder Anzahl von Ereignissen.',
    invalid_input:
      'Bitte die angezeigten Kennungen prüfen. Jede ID hat die Form 12345678-1234-1234-1234-123456789abc.',
  };
  function useTarget(target) {
    mode.value = target.replyId ? 'reply' : target.submissionId ? 'submission' : 'case';
    caseId.value = target.caseId;
    destination.value = target.destinationId || '';
    submission.value = target.submissionId || '';
    replyId.value = target.replyId || '';
  }
  function completeKnownContext() {
    const type = mode.value,
      id = type === 'reply' ? replyId.value.trim().toLowerCase() : submission.value.trim().toLowerCase();
    if (type === 'case') return;
    const known = recent.value.find((item) => item.subjectType === type && item.subjectId === id);
    if (known) {
      caseId.value = known.caseId;
      if (type === 'submission') destination.value = known.destinationId;
    }
  }
  function name(event) {
    const type = event.eventType.split('/').at(-1);
    return (
      {
        'create-submission': 'Einreichung angelegt',
        'submit-submission': 'Einreichung übermittelt',
        'accept-submission': 'Einreichung angenommen',
        'reject-submission': 'Einreichung abgelehnt',
        'polling-notify-submission': 'Zur Abholung bereitgestellt',
        'notify-submission': 'Empfänger benachrichtigt',
        'delete-submission': 'Einreichung gelöscht',
        'create-reply': 'Antwort angelegt',
        'submit-reply': 'Antwort übermittelt',
        'notify-reply': 'Antwort zur Abholung bereit',
        'accept-reply': 'Antwort angenommen',
        'reject-reply': 'Antwort abgelehnt',
        'delete-reply': 'Antwort gelöscht',
      }[type] || type
    );
  }
  const time = (value) => new Date(value).toLocaleString('de-DE');
  async function changePage(value) {
    page.value = value;
    await nextTick();
    heading.value?.focus();
  }
  async function release(active, id) {
    try {
      await discardEventLog(invoke, active, id);
    } catch (cause) {
      if (resetsSessions(cause) && alive) emit('fatal', cause);
    }
  }
  function reset() {
    generation++;
    controller?.abort();
    controller = null;
    preview.value = null;
    const previous = result.value,
      active = owner;
    result.value = null;
    owner = null;
    events.value = [];
    query.value = '';
    page.value = 0;
    return previous && active ? release(active, previous.logId) : Promise.resolve();
  }
  watch(
    context,
    () => {
      error.value = '';
      diagnostic.value = '';
      void reset();
    },
    { flush: 'sync' },
  );
  watch(
    [mode, destination, caseId, submission, replyId],
    () => {
      error.value = '';
      diagnostic.value = '';
      void reset();
    },
    { flush: 'sync' },
  );
  watch(query, () => {
    page.value = 0;
  });
  watch(
    () => props.visible,
    (visible) => {
      if (!visible) void reset();
    },
  );
  watch(
    () => props.target,
    async (target) => {
      if (!target) return;
      mode.value = target.replyId ? 'reply' : target.submissionId ? 'submission' : 'case';
      replyId.value = target.replyId || '';
      destination.value = target.destinationId || '';
      caseId.value = target.caseId;
      submission.value = target.submissionId || '';
      await nextTick();
      if (props.visible && target.apiVersion === props.session?.apiVersion && !disabled.value) void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    alive = false;
    void reset();
  });
  async function run(action, operation) {
    if (disabled.value) return;
    const active = { ...props.session },
      stamp = generation,
      started = performance.now();
    const current = () => alive && stamp === generation;
    pending.value = true;
    error.value = '';
    diagnostic.value = '';
    emit('busy', true);
    let status = 'Erfolgreich';
    try {
      await operation(active, current);
      if (!current()) status = 'Abgebrochen';
    } catch (cause) {
      const code = typeof cause === 'string' ? cause : cause?.message;
      status = code === 'content_cancelled' ? 'Abgebrochen' : 'Fehlgeschlagen';
      if (current() && code !== 'content_cancelled') {
        error.value = messages[code] || errorMessage(cause);
        diagnostic.value = diagnosticCode(cause);
      }
      if (resetsSessions(cause)) emit('fatal', cause);
    } finally {
      controller = null;
      pending.value = false;
      emit('busy', false);
      emit('activity', {
        api: active.apiVersion,
        role: active.role === 'online-service' ? 'Onlinedienst' : 'Fachverfahren',
        action,
        status,
        started,
      });
    }
  }
  function load() {
    if (disabled.value) return;
    const reply = mode.value === 'reply',
      replyValue = replyId.value.trim().toLowerCase();
    const cleanup = reset(),
      ids = [
        destination.value.trim().toLowerCase(),
        caseId.value.trim().toLowerCase(),
        submission.value.trim().toLowerCase(),
      ];
    return run('Event Log prüfen', async (active, current) => {
      await cleanup;
      let loaded;
      try {
        loaded =
          mode.value === 'case'
            ? await loadCaseEventLog(invoke, active, ids[1])
            : reply
              ? await loadReplyEventLog(invoke, active, ids[1], replyValue)
              : await loadEventLog(invoke, active, ...ids);
        const rows = [],
          seen = new Set();
        let bytes = 0;
        for (let offset = 0; offset < loaded.total; offset += 5) {
          if (!current()) return;
          const batch = await listEventLog(invoke, active, loaded, offset);
          for (const event of batch.events) {
            bytes += event.headerBytes + event.claimsBytes;
            if (seen.has(event.eventId) || bytes > 16 * 1024 * 1024) throw new Error('engine_protocol_error');
            seen.add(event.eventId);
            rows.push(event);
          }
        }
        if (!current()) return;
        owner = active;
        result.value = loaded;
        events.value = rows.sort((left, right) => Date.parse(left.issuedAt) - Date.parse(right.issuedAt));
        loaded = null;
        await nextTick();
        if (current()) heading.value?.focus();
      } finally {
        if (loaded) await release(active, loaded.logId);
      }
    });
  }
  function show(event, part, trigger) {
    if (!result.value) return;
    const log = result.value;
    return run('Ereignisdaten anzeigen', async (active, current) => {
      const cancellation = new AbortController();
      controller = cancellation;
      const rawText = await readEventDocument(invoke, active, log.logId, event, part, {
        signal: cancellation.signal,
      });
      if (current())
        preview.value = {
          kind: 'text',
          json: true,
          rawText,
          filename: `${name(event)} · ${part === 'header' ? 'JWS-Header' : 'Ereignisdaten'}`,
          notice: 'Originale dekodierte JSON-Daten des verifizierten Ereignisses.',
          footer: 'Inhalte und Verweise werden nicht ausgeführt.',
          trigger,
        };
    });
  }
  async function closePreview() {
    const trigger = preview.value?.trigger;
    preview.value = null;
    await nextTick();
    trigger?.focus();
  }
  return {
    diagnostic,
    recent,
    mode,
    replyId,
    destination,
    caseId,
    submission,
    result,
    preview,
    pending,
    error,
    query,
    page,
    heading,
    disabled,
    filtered,
    shown,
    useTarget,
    completeKnownContext,
    name,
    time,
    changePage,
    reset,
    load,
    show,
    closePreview,
  };
}
