/** One explicit, bounded observation. Never overlaps requests or retries a write. */
export function createWaiter({
  check,
  changed = () => {},
  now = () => Date.now(),
  schedule = (fn: () => void, ms: number) => setTimeout(fn, ms),
  unschedule = (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
}: {
  check: () => Promise<boolean>;
  changed?: (state: {
    active: boolean;
    remaining: number;
    lastChecked: number | null;
    message: string;
  }) => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  unschedule?: (id: ReturnType<typeof setTimeout>) => void;
}) {
  let generation = 0,
    active = false,
    deadline = 0,
    lastChecked: number | null = null,
    timer: ReturnType<typeof setTimeout> | undefined,
    inFlight = false,
    delay = 10000;
  function notify(message: string) {
    changed({ active, remaining: Math.max(0, deadline - now()), lastChecked, message });
  }
  function stop(message = 'Warten beendet') {
    generation++;
    active = false;
    if (timer !== undefined) unschedule(timer);
    timer = undefined;
    notify(message);
  }
  async function tick(stamp: number) {
    if (!active || generation !== stamp) return;
    if (now() >= deadline) {
      stop('Wartezeit abgelaufen. Innerhalb des Zeitfensters wurde kein passender Nachweis gefunden.');
      return;
    }
    if (inFlight) {
      timer = schedule(() => {
        void tick(stamp);
      }, 1000);
      return;
    }
    inFlight = true;
    try {
      const found = await check();
      if (!active || generation !== stamp) return;
      if (now() >= deadline) {
        stop('Wartezeit abgelaufen. Innerhalb des Zeitfensters wurde kein passender Nachweis gefunden.');
        return;
      }
      lastChecked = now();
      delay = 10000;
      if (found) {
        stop('Passender Nachweis gefunden. Öffnen und prüfen Sie die Nachricht.');
        return;
      }
      notify('Noch kein passender Nachweis vorhanden');
    } catch {
      if (!active || generation !== stamp) return;
      delay = Math.min(60000, delay * 2);
      notify('Abfrage derzeit nicht möglich. Nächster Versuch mit größerem Abstand.');
    } finally {
      inFlight = false;
    }
    if (active && generation === stamp)
      timer = schedule(
        () => {
          void tick(stamp);
        },
        Math.min(delay, Math.max(0, deadline - now())),
      );
  }
  return {
    start() {
      if (active) return;
      generation++;
      active = true;
      deadline = now() + 300000;
      delay = 10000;
      lastChecked = null;
      notify('Auf passenden Nachweis warten');
      void tick(generation);
    },
    stop,
    get active() {
      return active;
    },
  };
}
