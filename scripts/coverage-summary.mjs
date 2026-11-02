import { readFile, appendFile } from 'node:fs/promises';

const scopes = process.argv.slice(2);
if (!scopes.length) throw new Error('coverage_scope_required');
const limits = {
  node: { lines: 56, branches: 85 },
  browser: { lines: 82, branches: 70 },
  engine: { lines: 82, branches: 63 },
  // Windows and Linux compile different cfg paths. Establish native floors only
  // from their separate platform reports, never from a substituted Linux score.
  'native-contracts': {},
  'native-desktop': {},
};
const rows = [];
const nativeFloors = { 'native-contracts': { win32: 79, linux: 69 }, 'native-desktop': { win32: 37 } };
for (const scope of scopes) {
  if (!Object.hasOwn(limits, scope)) throw new Error('coverage_scope_invalid');
  const report = JSON.parse(await readFile(`coverage/${scope}/scope.json`, 'utf8'));
  // JaCoCo uses LINE/BRANCH, LLVM calls denominator count instead of total.
  const lineMetric = report.summary.lines || report.summary.LINE;
  const branchMetric = report.summary.branches || report.summary.BRANCH;
  const percent = (metric) => metric.pct ?? metric.percent;
  const total = lineMetric?.total ?? lineMetric?.count;
  if (!total || !Number.isFinite(percent(lineMetric))) throw new Error(`coverage_empty: ${scope}`);
  let thresholds = limits[scope];
  if (Object.hasOwn(nativeFloors, scope)) {
    if (!report.platform || !report.architecture) throw new Error('coverage_native_platform_missing');
    const floor = nativeFloors[scope][report.platform];
    if (floor !== undefined) thresholds = { lines: floor };
  }
  for (const metric of [lineMetric, branchMetric].filter(Boolean)) {
    const count = metric.total ?? metric.count;
    if (
      !Number.isSafeInteger(count) ||
      !Number.isSafeInteger(metric.covered) ||
      metric.covered < 0 ||
      metric.covered > count ||
      (count && Math.abs(percent(metric) - (metric.covered / count) * 100) > 0.02)
    )
      throw new Error('coverage_metric_invalid');
  }
  for (const [name, floor] of Object.entries(thresholds)) {
    const metric = name === 'lines' ? lineMetric : branchMetric;
    if (!metric || !Number.isFinite(percent(metric)) || percent(metric) < floor)
      throw new Error(`coverage_below_baseline: ${scope}/${name} < ${floor}%`);
  }
  const branchTotal = branchMetric?.total ?? branchMetric?.count;
  rows.push(
    `| ${report.scope} | ${percent(lineMetric).toFixed(2)}% (${lineMetric.covered}/${total}) | ${branchTotal ? percent(branchMetric).toFixed(2) + '%' : 'not measured'} |`,
  );
}
const markdown = `### Measured coverage\n\n| Scope | Lines | Branches |\n| --- | --- | --- |\n${rows.join('\n')}\n\nScopes are separate measurements, not an averaged overall score. Native reports cover only code compiled for their stated target. Reports include unloaded frontend modules.\n`;
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
