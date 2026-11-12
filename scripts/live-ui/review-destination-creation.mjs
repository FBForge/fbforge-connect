// Manual setup is a separate entry point from restoring a public snapshot.
import { check } from './desktop.mjs';
import { connectProfile, navigate } from './exchange.mjs';
const button = (page, name) => page.getByRole('button', { name, exact: true });
export async function reviewDestinationCreation(desktop, fixture) {
  const page = desktop.page;
  await connectProfile(page, fixture.receiverProfiles.find((p) => p.api === 'v3').id);
  await navigate(page, 'Destinations');
  await button(page, 'Neue Destination anlegen').click();
  const fixtureName = `${fixture.runName} Manuelle Anlage`;
  await page.locator('#setup-name').fill(fixtureName);
  await page.locator('#setup-organisation').fill('Fiktive CI-Testbehörde');
  await page.locator('#setup-email').fill('test@example.invalid');
  await page.locator('#setup-address').fill('Musterstraße 1, 12345 Musterstadt');
  await page.locator('#setup-phone').fill('+4930000000');
  await page.locator('#setup-type').selectOption('A');
  await button(page, 'Weiter').click();
  await page.locator('#setup-service').fill(fixture.service);
  await button(page, 'Mitgelieferte TEST-Schemata einsetzen').click();
  await button(page, 'Weiter').click();
  await button(page, 'Destination vorbereiten').click();
  const dialog = page.getByRole('dialog', { name: 'Diese Destination anlegen?', exact: true });
  await dialog.waitFor();
  fixture.expectCreatedDestination(fixtureName);
  await button(dialog, 'Destination jetzt anlegen').click();
  await page
    .getByRole('heading', { name: 'Destination und Schlüsselzuordnung geprüft', exact: true })
    .waitFor();
  const id = (await page.locator('[aria-labelledby="destination-setup-result"] code').allTextContents())
    .find((text) => /^[a-f0-9-]{36}$/i.test(text.trim()))
    ?.trim();
  check(id, 'live_ui_manual_destination_identifier_missing');
  await fixture.confirmCreatedDestination(fixtureName, id);
  const actual = await fixture.readManagedFixture(id);
  check(
    ['created', 'draft'].includes(actual.status) &&
      actual.metadataVersions.includes('2.0.0') &&
      actual.metadataVersions.includes('3.0.0') &&
      JSON.parse(actual.contactJson).legalName === 'Fiktive CI-Testbehörde' &&
      JSON.parse(actual.offersJson).publicServices.some((s) =>
        s.submissionSchemas.some(
          (schema) => schema.schemaUri === 'urn:fit-connect:test-client:demo:application:1',
        ),
      ),
    'live_ui_manual_destination_server_readback_failed',
  );
  console.log(
    'Real installed desktop: manual destination wizard, fictitious contact, demo schemas, new protected TEST keys and separately confirmed creation verified through the actual API without activation',
  );
}
