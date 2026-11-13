import { check, until } from './desktop.mjs';
const button = (scope, name) => scope.getByRole('button', { name, exact: true });

// Operates only on the schema created by this acceptance run in its isolated profile.
export async function reviewSchemaLibraryChanges(page, uri, originalTitle) {
  const library = page.getByRole('region', { name: 'Antwortschemas im Profil', exact: true });
  const picker = library.getByRole('combobox', { name: 'Gespeichertes Antwortschema', exact: true });
  await picker.selectOption(uri);
  await button(library, 'Entwurf öffnen').click();
  const title = page.locator('#channel-title'),
    revised = `${originalTitle} überarbeitet`;
  await until(async () => (await title.inputValue()) === originalTitle, 'live_ui_library_original_missing');
  await title.fill(revised);
  await button(library, 'Im Profil speichern').click();
  const replace = library.getByRole('group', { name: 'Antwortschema ersetzen', exact: true });
  await button(replace, 'Abbrechen').click();
  await button(library, 'Entwurf öffnen').click();
  await until(
    async () => (await title.inputValue()) === originalTitle,
    'live_ui_library_cancel_changed_schema',
  );
  await title.fill(revised);
  await button(library, 'Im Profil speichern').click();
  await button(replace, 'Definition ersetzen').click();
  await until(
    async () => (await picker.locator('option').allTextContents()).some((text) => text.includes(revised)),
    'live_ui_library_replace_missing',
  );
  await title.fill('Nicht gespeichert');
  await button(library, 'Entwurf öffnen').click();
  await until(async () => (await title.inputValue()) === revised, 'live_ui_library_replace_not_durable');
  await button(library, 'Aus Profil entfernen').click();
  const remove = library.getByRole('group', { name: 'Antwortschema entfernen', exact: true });
  await button(remove, 'Abbrechen').click();
  check((await picker.inputValue()) === uri, 'live_ui_library_cancel_removed_schema');
  await button(library, 'Aus Profil entfernen').click();
  await button(remove, 'Jetzt entfernen').click();
  await until(
    async () =>
      (await picker.count()) === 0 ||
      !(await picker
        .locator('option')
        .evaluateAll((options, uri) => options.some((option) => option.value === uri), uri)),
    'live_ui_library_delete_missing',
  );
}
