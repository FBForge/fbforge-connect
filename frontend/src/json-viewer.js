const bytes = (text) => new TextEncoder().encode(text).byteLength;
const tokensOf = (text) => text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}[\],:]|[^\s{}[\],:]+/g) || [];
function boundedDepth(text, limit = 16) {
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      if (++depth > limit) return false;
    } else if (character === '}' || character === ']') depth--;
  }
  return true;
}
// Format lexical tokens so large numbers and duplicate keys stay unchanged.
function prettyPrint(text) {
  if (typeof text !== 'string' || bytes(text) > 2 * 1024 * 1024 || !boundedDepth(text, 64)) return text;
  try {
    JSON.parse(text);
  } catch {
    return text;
  }
  const tokens = tokensOf(text);
  const output = [];
  let depth = 0,
    size = 0;
  const emit = (value) => {
    size += value.length;
    if (size > 2 * 1024 * 1024) throw new Error('format limit');
    output.push(value);
  };
  const newline = () => emit('\n' + '  '.repeat(depth));
  try {
    tokens.forEach((token, index) => {
      if (token === '{' || token === '[') {
        emit(token);
        depth++;
        if (!['}', ']'].includes(tokens[index + 1])) newline();
      } else if (token === '}' || token === ']') {
        depth--;
        if (!['{', '['].includes(tokens[index - 1])) newline();
        emit(token);
      } else if (token === ',') {
        emit(token);
        newline();
      } else if (token === ':') emit(': ');
      else emit(token);
    });
    const formatted = output.join('');
    return bytes(formatted) <= 2 * 1024 * 1024 ? formatted : text;
  } catch {
    return text;
  }
}
function nodes(text) {
  if (typeof text !== 'string' || bytes(text) > 256 * 1024 || !boundedDepth(text)) return null;
  try {
    JSON.parse(text);
    const result = [],
      tokens = tokensOf(text);
    let cursor = 0;
    function visit(label, parent, depth) {
      if (result.length >= 2000) throw new Error('tree limit');
      const token = tokens[cursor++],
        id = result.length,
        branch = token === '{' || token === '[',
        array = token === '[';
      const node = {
        id,
        parent,
        depth,
        label,
        branch,
        array,
        size: 0,
        type: branch
          ? 'object'
          : token === 'null'
            ? 'null'
            : token[0] === '"'
              ? 'string'
              : ['true', 'false'].includes(token)
                ? 'boolean'
                : 'number',
        value: token,
      };
      result.push(node);
      if (branch) {
        const closing = array ? ']' : '}';
        while (tokens[cursor] !== closing) {
          const key = array ? `[${node.size}]` : JSON.parse(tokens[cursor++]);
          if (!array) cursor++;
          visit(key, id, depth + 1);
          node.size++;
          if (tokens[cursor] === ',') cursor++;
          else break;
        }
        cursor++;
        node.value = `${array ? 'Array' : 'Objekt'} · ${node.size} Einträge`;
      }
    }
    visit('JSON', null, 0);
    return result;
  } catch {
    return null;
  }
}
function mount(host, { value, text, title = 'JSON', note = '' } = {}) {
  const document = host.ownerDocument;
  const original = text ?? JSON.stringify(value, null, 2);
  const entries = nodes(original),
    lines = [],
    branches = [];
  let matches = [],
    matchIndex = -1,
    alive = true,
    foldedBeforeSearch = null;
  const element = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  const panel = element('section', 'json-panel'),
    head = element('div', 'json-panel-head');
  head.append(element('strong', '', title), element('span', 'small-note', note));
  panel.append(head);
  const toolbar = element('div', 'json-toolbar'),
    searchWrap = element('div', 'json-search-wrap');
  const search = element('input', 'json-search');
  search.type = 'search';
  search.placeholder = 'JSON durchsuchen …';
  search.setAttribute('aria-label', 'JSON durchsuchen');
  const count = element('span', 'json-search-count', '0 Treffer');
  count.setAttribute('role', 'status');
  searchWrap.append(search, count);
  const actions = element('div', 'json-toolbar-actions');
  toolbar.append(searchWrap, actions);
  panel.append(toolbar);
  const tree = element('div', 'json-tree'),
    raw = element('pre', 'json-tree json-formatted');
  raw.textContent = prettyPrint(original);
  raw.hidden = Boolean(entries);
  tree.hidden = !entries;
  const containers = new Map();
  for (const node of entries || []) {
    const wrapper = element(
      node.branch ? 'details' : 'div',
      node.branch ? 'json-node' : 'json-leaf json-line',
    );
    const line = node.branch ? element('summary', 'json-line') : wrapper;
    if (node.id !== 0) line.append(element('span', 'json-key', node.label), document.createTextNode(': '));
    line.append(
      element(
        'span',
        node.branch ? 'json-meta' : `json-${node.type}`,
        node.branch
          ? `${node.array ? '[' : '{'}${node.size}${node.array ? ']' : '}'} ${node.array ? 'Array' : 'Object'}`
          : node.value,
      ),
    );
    if (node.branch) {
      wrapper.open = node.id === 0;
      const children = element('div', 'json-children');
      wrapper.append(line, children);
      containers.set(node.id, children);
      branches.push(wrapper);
    }
    (node.parent === null ? tree : containers.get(node.parent)).append(wrapper);
    lines.push(line);
  }
  function focusMatch() {
    matches.forEach((line) => line.classList.remove('json-match-current'));
    const current = matches[matchIndex];
    if (!current) {
      count.textContent = '0 Treffer';
      return;
    }
    current.classList.add('json-match-current');
    current.scrollIntoView({ block: 'nearest' });
    count.textContent = `${matchIndex + 1}/${matches.length}`;
  }
  function move(delta) {
    if (matches.length) {
      matchIndex = (matchIndex + delta + matches.length) % matches.length;
      focusMatch();
    }
  }
  function button(label, action) {
    const node = element('button', 'button secondary small-button', label);
    node.type = 'button';
    node.addEventListener('click', action);
    actions.append(node);
    return node;
  }
  const previous = button('↑ Treffer', () => move(-1)),
    next = button('↓ Treffer', () => move(1));
  previous.disabled = next.disabled = true;
  const expand = button('Alles aufklappen', () =>
    branches.forEach((branch) => {
      branch.open = true;
    }),
  );
  const collapse = button('Alles einklappen', () =>
    branches.forEach((branch, index) => {
      branch.open = index === 0;
    }),
  );
  const structure = button('Struktur', () => setMode(true)),
    formatted = button('JSON-Text', () => setMode(false));
  function setMode(structured) {
    tree.hidden = !structured;
    raw.hidden = structured;
    search.disabled = !structured;
    structure.setAttribute('aria-pressed', String(structured));
    formatted.setAttribute('aria-pressed', String(!structured));
    expand.disabled = collapse.disabled = !structured;
    previous.disabled = next.disabled = !structured || !matches.length;
  }
  const copy = button('JSON kopieren', async () => {
    try {
      await document.defaultView.navigator.clipboard.writeText(original);
      if (alive) copy.textContent = 'Kopiert';
    } catch {
      if (alive) copy.textContent = 'Kopieren nicht verfügbar';
    }
  });
  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase('de-DE');
    if (query && foldedBeforeSearch === null) foldedBeforeSearch = branches.map((branch) => branch.open);
    if (foldedBeforeSearch !== null)
      branches.forEach((branch, index) => {
        branch.open = foldedBeforeSearch[index];
      });
    if (!query) foldedBeforeSearch = null;
    lines.forEach((line) => line.classList.remove('json-match', 'json-match-current'));
    matches = query
      ? lines.filter((line) => line.textContent.toLocaleLowerCase('de-DE').includes(query))
      : [];
    for (const line of matches) {
      line.classList.add('json-match');
      for (let parent = line.parentElement; parent && parent !== tree; parent = parent.parentElement)
        if (parent.tagName === 'DETAILS') parent.open = true;
    }
    matchIndex = matches.length ? 0 : -1;
    previous.disabled = next.disabled = !matches.length;
    focusMatch();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      move(event.shiftKey ? -1 : 1);
    }
  });
  panel.append(tree, raw);
  host.replaceChildren(panel);
  if (!entries) {
    structure.disabled = true;
    setMode(false);
  } else setMode(true);
  return {
    destroy() {
      alive = false;
      host.replaceChildren();
    },
  };
}
export { mount, prettyPrint, nodes };
