import test from 'node:test';
import assert from 'node:assert/strict';
import { prettyPrint, nodes, mount } from '../frontend/src/json-viewer.js';

test('pretty JSON preserves number tokens, duplicate keys and escaped string content', () => {
  const input = '{"n":9007199254740993,"x":1,"x":2,"s":"a, { \\"b\\" }","a":[true,null,{}]}';
  const formatted = prettyPrint(input);
  assert.match(formatted, /\n {2}"n": 9007199254740993,/);
  assert.match(formatted, /"x": 1,\n {2}"x": 2/);
  assert.match(formatted, /"s": "a, \{ \\"b\\" \}"/);
  assert.deepEqual(JSON.parse(formatted), JSON.parse(input));
  assert.equal(prettyPrint('invalid JSON'), 'invalid JSON');
});

test('tree parsing remains bounded and records parent relationships for search', () => {
  const tree = nodes('{"nested":{"needle":"<img src=x onerror=alert(1)>"},"other":true}');
  assert.equal(tree[2].parent, 1);
  assert.equal(tree[2].label, 'needle');
  assert.equal(tree[2].value, '"<img src=x onerror=alert(1)>"');
  const precise = nodes('{"n":9007199254740993,"x":1,"x":2}');
  assert.equal(precise[1].value, '9007199254740993');
  assert.deepEqual(
    precise.filter((node) => node.label === 'x').map((node) => node.value),
    ['1', '2'],
  );
  for (const text of [
    JSON.stringify(Array(2000).fill(0)),
    '['.repeat(17) + '0' + ']'.repeat(17),
    JSON.stringify('x'.repeat(256 * 1024)),
  ])
    assert.equal(nodes(text), null);
});

// A small DOM boundary fixture exercises the viewer events without an HTML parser.
function fixture(text) {
  const all = [];
  let copied;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.attributes = {};
      this.events = {};
      this.className = '';
      this.open = false;
      this.ownerDocument = document;
      all.push(this);
    }
    append(...children) {
      for (const child of children) {
        child.parentElement = this;
        this.children.push(child);
      }
    }
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    }
    set textContent(value) {
      this.literal = String(value);
      this.children = [];
    }
    get textContent() {
      return this.literal ?? this.children.map((child) => child.textContent).join('');
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    addEventListener(name, callback) {
      this.events[name] = callback;
    }
    scrollIntoView() {
      this.scrolled = true;
    }
    get classList() {
      return {
        add: (...names) => {
          this.className = [...new Set([...this.className.split(' '), ...names])].join(' ');
        },
        remove: (...names) => {
          this.className = this.className
            .split(' ')
            .filter((name) => !names.includes(name))
            .join(' ');
        },
      };
    }
  }
  const document = {
    defaultView: {
      navigator: {
        clipboard: {
          writeText: async (value) => {
            copied = value;
          },
        },
      },
    },
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => {
      const node = new Element('#text');
      node.textContent = text;
      return node;
    },
  };
  const host = new Element('main'),
    viewer = mount(host, { text });
  return {
    all,
    host,
    viewer,
    get copied() {
      return copied;
    },
    button: (label) => all.find((node) => node.tagName === 'BUTTON' && node.textContent === label),
  };
}

test('shared viewer searches and expands ancestors, switches modes and copies exact input', async () => {
  const original = '{"nested":{"needle":9007199254740993},"key":1,"key":2}';
  const f = fixture(original),
    branches = f.all.filter((node) => node.tagName === 'DETAILS');
  assert.equal(branches[0].open, true);
  assert.equal(branches[1].open, false);
  const search = f.all.find((node) => node.tagName === 'INPUT');
  search.value = 'needle';
  search.events.input();
  assert.equal(branches[1].open, true);
  assert.equal(f.all.filter((node) => node.className.split(' ').includes('json-match')).length, 1);
  search.value = 'key';
  search.events.input();
  assert.equal(branches[1].open, false);
  search.value = '';
  search.events.input();
  assert.equal(branches[1].open, false);
  f.button('Alles einklappen').events.click();
  assert.equal(branches[1].open, false);
  f.button('Alles aufklappen').events.click();
  assert.equal(branches[1].open, true);
  f.button('JSON-Text').events.click();
  const pre = f.all.find((node) => node.tagName === 'PRE');
  assert.equal(pre.hidden, false);
  assert.equal(search.disabled, true);
  assert.match(pre.textContent, /9007199254740993/);
  await f.button('JSON kopieren').events.click();
  assert.equal(f.copied, original);
  f.viewer.destroy();
  assert.equal(f.host.children.length, 0);
});

test('shared viewer renders untrusted markup as literal text and falls back for large trees', () => {
  const f = fixture('{"value":"<script>alert(1)</script>"}');
  assert.equal(
    f.all.some((node) => node.tagName === 'SCRIPT'),
    false,
  );
  assert.equal(
    f.all.some((node) => node.textContent === '"<script>alert(1)</script>"'),
    true,
  );
  const large = fixture(JSON.stringify(Array(2000).fill(0)));
  assert.equal(large.button('Struktur').disabled, true);
  assert.equal(large.all.find((node) => node.tagName === 'PRE').hidden, false);
});
