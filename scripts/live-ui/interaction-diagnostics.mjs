// Fixed diagnostic categories only: never print Playwright call logs, input values or page text.
import { diagnosticCode } from '../../frontend/src/diagnostics.js';
export function interactionFailure(error) {
  const message = String(error?.message || '');
  return {
    timeout: /timeout.*exceeded/i.test(message),
    ambiguous: /strict mode violation/i.test(message),
    disabled: /element is not enabled/i.test(message),
    hidden: /element is not visible/i.test(message),
    unstable: /element is not stable/i.test(message),
    covered: /intercepts pointer events/i.test(message),
    outsideViewport: /outside of the viewport/i.test(message),
    detached: /element (?:was|is) detached|not attached to the DOM/i.test(message),
  };
}

async function controlState(locator) {
  const count = await locator.count();
  if (count !== 1) return { count };
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const inViewport = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
    const hit = inViewport ? document.elementFromPoint(x, y) : null;
    return {
      count: 1,
      disabled: element.matches(':disabled'),
      rendered: element.getClientRects().length > 0,
      inViewport,
      hitTarget: Boolean(hit && (hit === element || element.contains(hit))),
    };
  });
}

const previewStatuses = {
  'Zur Bestätigung': 'prepared',
  Abgeschlossen: 'completed',
  'Teilweise abgeschlossen': 'partial',
  'Ausgang ungewiss': 'uncertain',
  Fehlgeschlagen: 'failed',
  'Zwischenzeitlich geändert': 'conflict',
  'Vorschau abgelaufen': 'expired',
  'Wird gespeichert': 'running',
};

export async function interactionDiagnostics(page, error) {
  const library = page.getByRole('region', { name: 'Antwortschemas im Profil', exact: true });
  const preview = page.locator('[aria-labelledby="update-preview-title"]');
  const heading = await preview.locator('h3').allTextContents();
  const rows = await preview.locator(':scope > article > h4').allTextContents();
  const picker = library.getByRole('combobox', { name: 'Gespeichertes Antwortschema', exact: true });
  const button = (scope, name) => scope.getByRole('button', { name, exact: true });
  console.error(
    `Real desktop interaction state: ${JSON.stringify({
      failure: interactionFailure(error),
      openDialogs: await page.locator('dialog[open]').count(),
      library: {
        picker: await controlState(picker),
        hasSelection: (await picker.count()) === 1 ? Boolean(await picker.inputValue()) : null,
        open: await controlState(button(library, 'Entwurf öffnen')),
        save: await controlState(button(library, 'Im Profil speichern')),
        alerts: await library.getByRole('alert').count(),
      },
      destination: {
        status: heading.length === 1 ? previewStatuses[heading[0].trim()] || 'unknown' : 'absent',
        rows: rows.map((text) => previewStatuses[text.split(' · ').at(-1).trim()] || 'unknown'),
        messages: await preview.locator('article [role="status"]').count(),
        codes: (await preview.locator('[data-destination-error]').allTextContents()).map(diagnosticCode),
        http: (await preview.locator('[data-destination-http]').allTextContents())
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 100 && n <= 599),
        problems: (await preview.locator('[data-destination-problem]').allTextContents()).filter((v) =>
          /^[a-z][a-z0-9-]{0,127}$/.test(v),
        ),
        confirm: await controlState(
          button(preview, 'Diese Änderungen verbindlich in der gewählten Umgebung speichern'),
        ),
      },
      scannerReady: await page
        .locator('.scan-status')
        .getByText('Lokaler Virenscan bereit', { exact: true })
        .isVisible(),
    })}`,
  );
}
