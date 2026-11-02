import { test as base } from '@playwright/test';
import CoverageReport from 'monocart-coverage-reports';
import { browserCoverageOptions } from '../../scripts/coverage-options.mjs';

export { expect } from '@playwright/test';
const output = process.env.FBFORGE_BROWSER_COVERAGE;
async function beginCoverage(page) {
  if (output) await page.coverage.startJSCoverage({ resetOnNavigation: false });
}
async function finishCoverage(page) {
  if (!output) return;
  if (page.isClosed()) throw new Error('coverage_page_closed_before_collection');
  const coverage = await page.coverage.stopJSCoverage();
  await new CoverageReport(browserCoverageOptions(output)).add(coverage);
}

// Both the standard page and explicitly isolated pages have the same collection
// and cleanup lifecycle. Tests never leave a browser context behind.
export const test = base.extend({
  page: async ({ page }, use) => {
    await beginCoverage(page);
    try {
      await use(page);
    } finally {
      await finishCoverage(page);
    }
  },
  createPage: async ({ browser }, use) => {
    const pages = [];
    const failures = [];
    try {
      await use(async (options) => {
        const context = await browser.newContext(options);
        const page = await context.newPage();
        pages.push(page);
        await beginCoverage(page);
        return page;
      });
    } catch (error) {
      failures.push(error);
    }
    const results = await Promise.allSettled(
      pages.map(async (page) => {
        try {
          await finishCoverage(page);
        } finally {
          await page.context().close();
        }
      }),
    );
    for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
    if (failures.length) throw new AggregateError(failures, 'Browser fixture or coverage cleanup failed');
  },
});
