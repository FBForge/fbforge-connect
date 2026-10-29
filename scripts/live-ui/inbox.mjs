// The receive workspace retains its selected message when another area is opened.
// Return through the same visible navigation a user would use before filling search fields.
export async function returnToInbox(page) {
  const back = page.getByRole('button', { name: 'Zurück zum Eingang', exact: true });
  if (await back.isVisible()) await back.click();
  await page.locator('#pickup-destination').waitFor({ state: 'visible' });
}
