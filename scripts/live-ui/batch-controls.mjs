import { check, until } from './desktop.mjs';

// Every opening reloads the keys. Rotation leaves more than one usable signer,
// so the choice can appear asynchronously even when it was absent on opening.
export async function prepareBatchSigningKey(dialog, signingKid) {
  const key = dialog.getByRole('combobox', { name: 'Signaturschlüssel', exact: true });
  const start = dialog.getByRole('button', { name: 'Zielordner wählen und starten', exact: true });
  await until(
    async () => (await key.isVisible()) || !(await start.isDisabled()),
    'live_ui_bulk_signing_key_unavailable',
  );
  if (await key.isVisible()) {
    await key.selectOption(signingKid);
    check((await key.inputValue()) === signingKid, 'live_ui_bulk_signing_key_mismatch');
  }
  await until(async () => !(await start.isDisabled()), 'live_ui_bulk_start_disabled');
  return start;
}
