import test from 'node:test';
import assert from 'node:assert/strict';
import { xmlFieldHintText, xmlEnumerationNames } from '../frontend/src/xml-example-values.js';
test('semantic XML hints bound names, text copied and nodes visited without concatenating complete annotations', () => {
  assert.equal(xmlFieldHintText('x'.repeat(1000), null).length, 160);
  assert.equal(xmlFieldHintText(null, null), '');
  const previous = globalThis.NodeFilter;
  globalThis.NodeFilter = { SHOW_ALL: 0xffffffff };
  try {
    for (const text of ['x', 'y'.repeat(2 * 1024 * 1024)]) {
      let visits = 0;
      const annotation = {
        get textContent() {
          throw Error('complete concatenation forbidden');
        },
        ownerDocument: {
          createTreeWalker(node, kind) {
            assert.equal(node, annotation);
            assert.equal(kind, 0xffffffff);
            return { nextNode: () => (++visits <= 100 ? { nodeType: 3, nodeValue: text } : null) };
          },
        },
      };
      const value = xmlFieldHintText('field', annotation);
      assert.ok(value.length <= 1024);
      assert.ok(visits <= 32);
    }
    const annotation = { ownerDocument: { createTreeWalker: () => ({ nextNode: () => null }) } };
    assert.equal(xmlFieldHintText('field', annotation), 'field');
  } finally {
    if (previous === undefined) delete globalThis.NodeFilter;
    else globalThis.NodeFilter = previous;
  }
});

test('enumeration names reject oversized text and charge nested traversal without complete concatenation', () => {
  assert.deepEqual(
    xmlEnumerationNames(null, new Set(), () => {}),
    [],
  );
  const previous = globalThis.NodeFilter;
  globalThis.NodeFilter = { SHOW_ALL: 0xffffffff, SHOW_ELEMENT: 1 };
  const elements = [
    [{ nodeType: 1 }, { nodeType: 3, nodeValue: 'message' }],
    [{ nodeType: 4, nodeValue: ' message ' }],
    [{ nodeType: 3, nodeValue: 'x'.repeat(1025) }],
    [{ nodeType: 3, nodeValue: 'unrelated' }],
  ];
  const annotation = {
    ownerDocument: {
      createTreeWalker(root, kind) {
        assert.equal(kind, root === annotation ? 1 : 0xffffffff);
        const nodes = root === annotation ? elements : root;
        let n = 0;
        return { nextNode: () => nodes[n++] || null };
      },
    },
  };
  try {
    let ticks = 0;
    assert.deepEqual(
      xmlEnumerationNames(annotation, new Set(['message']), () => ticks++),
      ['message'],
    );
    assert.equal(ticks, 9);
    assert.throws(
      () =>
        xmlEnumerationNames(annotation, new Set(), () => {
          throw Error('budget');
        }),
      /budget/,
    );
  } finally {
    if (previous === undefined) delete globalThis.NodeFilter;
    else globalThis.NodeFilter = previous;
  }
});
