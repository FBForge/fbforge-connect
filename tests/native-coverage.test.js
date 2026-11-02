import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNativeLcov, productLineCounts } from '../scripts/coverage-native-product.mjs';

const lcov = `SF:C:\\work\\desktop\\src\\sample.rs
FN:1,production
DA:1,1
DA:2,0
DA:5,11
DA:8,0
LF:7
LH:4
end_of_record
`;
const source =
  'fn production() {}\nfn uncovered() {}\n\n#[cfg(test)]\nmod checks {\nfn test_only() {}\n}\nfn after_tests() {}\n';
test('native LCOV preserves compiler hits and excludes only AST-classified test spans', () => {
  const file = parseNativeLcov(lcov).get('desktop/src/sample.rs');
  // Expanded macro totals can exceed unique DA line records. The product metric
  // counts unique source lines, including unexecuted code after a test module.
  const result = productLineCounts(file.hits, source, [[4, 7]]);
  assert.equal(result.count, 3);
  assert.equal(result.covered, 1);
  assert.equal(result.hits.get(2), false);
  assert.equal(result.hits.get(8), false);
  assert.equal(result.excludedTestLines, 1);
  assert.equal(productLineCounts(file.hits, source, [], true).count, 0);
});
test('native coverage refuses duplicate, truncated, foreign and contradictory source records', () => {
  for (const invalid of [
    lcov + lcov,
    lcov.replace('DA:2,0', 'DA:1,0'),
    lcov.replace('LF:7', 'LF:1'),
    lcov.replace('LH:4', 'LH:8'),
    lcov.replace('end_of_record', ''),
    lcov.replace('desktop\\src\\sample.rs', 'outside\\sample.rs'),
  ])
    assert.throws(() => parseNativeLcov(invalid), /native_coverage_/);
  const hits = parseNativeLcov(lcov).get('desktop/src/sample.rs').hits;
  assert.throws(() => productLineCounts(hits, 'short\n', []), /raw_count_mismatch/);
  assert.throws(() => productLineCounts(hits, source, [[4, 99]]), /test_span_invalid/);
});
