import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { posix, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

function nativeSourcePath(value) {
  const path = posix.normalize(value.replaceAll('\\', '/'));
  const source = /(?:^|\/)(desktop\/src\/.+[.]rs)$/.exec(path)?.[1];
  if (!source) throw new Error('native_coverage_non_product_source');
  return source;
}
export function parseNativeLcov(document) {
  const files = new Map();
  let file;
  for (const line of document.split(/\r?\n/)) {
    if (line.startsWith('SF:')) {
      if (file) throw new Error('native_coverage_lcov_incomplete');
      const path = nativeSourcePath(line.slice(3));
      if (files.has(path)) throw new Error('native_coverage_duplicate_file');
      file = { path, hits: new Map(), declared: {} };
      files.set(path, file);
    } else if (line.startsWith('DA:')) {
      const match = /^DA:(\d+),(\d+)(?:,[^,]*)?$/.exec(line);
      if (
        !file ||
        !match ||
        Number(match[1]) < 1 ||
        !Number.isSafeInteger(Number(match[1])) ||
        file.hits.has(Number(match[1]))
      )
        throw new Error('native_coverage_line_invalid');
      file.hits.set(Number(match[1]), BigInt(match[2]) > 0n);
    } else if (line.startsWith('LF:') || line.startsWith('LH:')) {
      if (!file || !/^L[FH]:\d+$/.test(line)) throw new Error('native_coverage_totals_invalid');
      const key = line[1] === 'F' ? 'count' : 'covered';
      if (Object.hasOwn(file.declared, key)) throw new Error('native_coverage_totals_invalid');
      file.declared[key] = Number(line.slice(3));
    } else if (line === 'end_of_record') {
      if (
        !file ||
        !Number.isSafeInteger(file.declared.count) ||
        !Number.isSafeInteger(file.declared.covered) ||
        file.declared.count < file.hits.size ||
        file.declared.covered < 0 ||
        file.declared.covered > file.declared.count
      )
        throw new Error('native_coverage_raw_count_mismatch');
      file = null;
    }
  }
  if (file || !files.size) throw new Error('native_coverage_lcov_incomplete');
  return files;
}
export function productLineCounts(hits, source, ranges, testFile = false) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if ([...hits.keys()].some((line) => line > lines.length))
    throw new Error('native_coverage_raw_count_mismatch');
  if (
    ranges.some(
      ([start, end]) =>
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 ||
        end < start ||
        end > lines.length,
    )
  )
    throw new Error('native_coverage_test_span_invalid');
  const product = new Map(
    [...hits].filter(([line]) => !testFile && !ranges.some(([start, end]) => line >= start && line <= end)),
  );
  return {
    hits: product,
    count: product.size,
    covered: [...product.values()].filter(Boolean).length,
    excludedTestLines: hits.size - product.size,
  };
}
const escape = (text) =>
  text.replace(
    /[&<>"']/g,
    (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value],
  );
const style =
  'body{font:16px system-ui;margin:2rem;padding:1rem}td,th{text-align:left;padding:.4rem 1rem;border-bottom:1px solid #ccc}table{border-collapse:collapse}.covered{background:#e2f3e2}.uncovered{background:#ffe3e3}.source{display:block;font:13px monospace;white-space:pre}.number{color:#555;display:inline-block;width:4rem}';
function html(title, content) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(title)}</title><style>${style}</style><h1>${escape(title)}</h1>${content}</html>\n`;
}
export async function nativeProductReport(directory, platform, architecture, target) {
  if (
    !['win32', 'linux', 'darwin'].includes(platform) ||
    !architecture ||
    !['contracts', 'desktop'].includes(target)
  )
    throw new Error('native_coverage_platform_required');
  directory = resolve(directory);
  const raw = JSON.parse(await readFile(resolve(directory, 'summary.json'), 'utf8'));
  const files = parseNativeLcov(await readFile(resolve(directory, 'raw.lcov'), 'utf8'));
  const expected = raw.data[0].files.map((file) => nativeSourcePath(file.filename));
  if (
    new Set(expected).size !== expected.length ||
    expected.length !== files.size ||
    expected.some((path) => !files.has(path))
  )
    throw new Error('native_coverage_inventory_invalid');
  const sources = await Promise.all(
    [...files.keys()].map(async (path) => ({ path, source: await readFile(path, 'utf8') })),
  );
  const analysis = spawnSync(
    'cargo',
    [
      '+1.99.0',
      'run',
      '--locked',
      '--quiet',
      '--manifest-path',
      'desktop/native-contracts/Cargo.toml',
      '--example',
      'coverage-source',
    ],
    {
      input: JSON.stringify(sources),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (analysis.error || analysis.status !== 0)
    throw new Error('native_coverage_source_analysis_failed', { cause: analysis.error || analysis.stderr });
  const exclusions = JSON.parse(analysis.stdout),
    measured = [];
  let productLcov = '';
  for (const { path, source } of sources) {
    const metadata = raw.data[0].files.find((file) => nativeSourcePath(file.filename) === path).summary.lines;
    if (
      metadata.count !== files.get(path).declared.count ||
      metadata.covered !== files.get(path).declared.covered
    )
      throw new Error('native_coverage_raw_count_mismatch');
    const result = productLineCounts(
      files.get(path).hits,
      source,
      exclusions.ranges[path] || [],
      exclusions.files.map((file) => posix.normalize(file.replaceAll('\\', '/'))).includes(path),
    );
    measured.push({
      path,
      count: result.count,
      covered: result.covered,
      excludedTestLines: result.excludedTestLines,
    });
    productLcov +=
      `SF:${path}\n` +
      [...result.hits].map(([line, hit]) => `DA:${line},${hit ? 1 : 0}\n`).join('') +
      `LF:${result.count}\nLH:${result.covered}\nend_of_record\n`;
    const rows = source
      .replaceAll('\r\n', '\n')
      .split('\n')
      .map(
        (code, index) =>
          `<span class="source ${result.hits.has(index + 1) ? (result.hits.get(index + 1) ? 'covered' : 'uncovered') : ''}"><span class="number">${index + 1}</span>${escape(code)}</span>`,
      )
      .join('\n');
    const output = resolve(directory, 'source', path + '.html');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      html(
        path,
        `<p>${result.covered}/${result.count} product lines covered. Test-only items and non-executable lines are uncoloured.</p>${rows}`,
      ),
    );
  }
  const lines = measured.reduce(
    (sum, file) => ({ count: sum.count + file.count, covered: sum.covered + file.covered }),
    { count: 0, covered: 0 },
  );
  if (!lines.count) throw new Error('native_product_coverage_empty');
  lines.percent = (lines.covered / lines.count) * 100;
  const scope = {
    scope: `Rust ${target === 'contracts' ? 'isolated contracts' : 'full desktop'} tests · product lines · ${platform}/${architecture}`,
    platform,
    architecture,
    method: 'Unique physical LLVM LCOV DA lines, syn AST test-only item exclusion',
    excludes: [
      'test-only items and test-file modules',
      'code excluded by target cfg',
      'dependencies',
      'non-instrumented installed UI executions',
    ],
    summary: { lines, branches: { count: 0, covered: 0, percent: 0 } },
    rawSummary: raw.data[0].totals,
    files: measured,
  };
  await writeFile(resolve(directory, 'product.lcov'), productLcov);
  await writeFile(resolve(directory, 'test-exclusions.json'), JSON.stringify(exclusions, null, 2) + '\n');
  await writeFile(resolve(directory, 'scope.json'), JSON.stringify(scope, null, 2) + '\n');
  const rows = measured
    .map(
      (file) =>
        `<tr><td><a href="source/${escape(file.path)}.html">${escape(file.path)}</a></td><td>${file.covered}/${file.count}</td><td>${file.excludedTestLines}</td></tr>`,
    )
    .join('\n');
  await writeFile(
    resolve(directory, 'index.html'),
    html(
      scope.scope,
      `<p>Unique product line coverage: <strong>${lines.percent.toFixed(2)}%</strong> (${lines.covered}/${lines.count}). Test-only items are identified with the Rust syntax tree. LCOV metadata is verified against the original LLVM JSON. Unique physical source lines are counted from DA records. Test-only items are excluded using the Rust syntax tree.</p><p><a href="html/index.html">Original LLVM report including inline test code and expanded macro counters</a>. Installed UI executions are measured separately.</p><table><tr><th>Source</th><th>Covered/product lines</th><th>Excluded test lines</th></tr>${rows}</table>`,
    ),
  );
  return scope;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/coverage-native-product.mjs')) {
  const report = await nativeProductReport(...process.argv.slice(2));
  console.log(
    `${report.scope}: ${report.summary.lines.percent.toFixed(2)}% (${report.summary.lines.covered}/${report.summary.lines.count})`,
  );
}
