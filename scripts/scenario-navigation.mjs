// The same visible preparation path is used by browser checks, live acceptance and help captures.
export async function preparationPage(page, name) {
  await page
    .getByRole('navigation', { name: 'Vorbereitungsschritte', exact: true })
    .getByRole('button', { name: new RegExp(`${name}$`) })
    .click();
}
export async function testOptions(page, category) {
  const select = page.getByRole('combobox', { name: 'Weitere Testeinstellungen', exact: true });
  if (!(await select.isVisible())) {
    await preparationPage(page, 'Testdaten');
    await page.getByRole('button', { name: 'Weitere Testeinstellungen', exact: true }).click();
  }
  await select.selectOption(category);
}
export async function testReuse(page) {
  await preparationPage(page, 'Prüfen und starten');
  const details = page.locator('.scenario-reuse');
  if (!(await details.evaluate((el) => el.open))) await details.locator('summary').click();
}
