// dedupe.js — pure line dedupe + sort logic, shared by app.js (main thread) and worker.js (large inputs).
// No DOM access here, so it runs unchanged inside a Web Worker.

// Fictional demo list for Maple Street Bakery (40 lines). tests/fixtures/maple-street-bakery.txt is generated from it.
export const SAMPLE_LINES = [
  'flour', 'Flour', 'sugar', 'butter   ', 'butter', 'eggs', 'item10', 'item2', 'Eggs', 'vanilla extract',
  'crème fraîche', 'Crème Fraîche', '', 'baking soda', 'baking  soda', 'yeast', 'sea salt', 'flour', '', 'Apple',
  'apple', 'cinnamon', 'item2', 'whole milk', 'heavy cream', 'brown sugar', 'sugar', '', 'almond flour', 'item1',
  'cre\u0300me frai\u0302che', 'cocoa powder', 'dark chocolate', 'yeast', 'honey', '  oat milk', 'oat milk', '', 'walnuts', 'item20',
];
export const SAMPLE = SAMPLE_LINES.join('\n') + '\n';

export const DEFAULTS = {
  ignoreCase: true,
  trim: true,
  collapse: false,
  removeBlank: true,
  mode: 'first', // first | last | dupes | unique
  sort: 'none', // none | az | za | natural | len-asc | len-desc | reverse | shuffle
  eol: 'auto', // auto | lf | crlf
};

export const PREVIEW_LINES = 5000;
const INVISIBLE = /[\u00a0\u2007\u202f\u200b-\u200d\u2060\ufeff]/;

function countOf(text, needle) {
  let n = 0;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Split on CRLF, LF or CR. A trailing line ending does not create a phantom blank line. */
export function splitLines(text) {
  if (!text) return { lines: [], eol: '\n', mixed: false, trailing: false };
  const lines = text.split(/\r\n|\r|\n/);
  const trailing = lines.length > 1 && lines[lines.length - 1] === '';
  if (trailing) lines.pop();
  const crlf = countOf(text, '\r\n');
  const cr = countOf(text, '\r') - crlf;
  const lf = countOf(text, '\n') - crlf;
  let eol = '\n';
  if (crlf > lf && crlf >= cr) eol = '\r\n';
  else if (cr > lf && cr > crlf) eol = '\r';
  const mixed = [crlf, cr, lf].filter((n) => n > 0).length > 1;
  return { lines, eol, mixed, trailing };
}

/** Comparison key: trim, collapse inner whitespace, locale-independent lower-case, NFC. */
export function keyOf(line, opts) {
  let k = line.normalize('NFC');
  if (opts.trim) k = k.trim();
  if (opts.collapse) k = k.replace(/\s+/g, ' ');
  if (opts.ignoreCase) k = k.toLowerCase();
  return k;
}

/** Number of code points (so an emoji counts as one character, not two UTF-16 units). */
function codePointLength(s) {
  let n = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { n--; i++; }
  }
  return n;
}

function randomBelow(n, pool) {
  // Rejection sampling keeps the shuffle unbiased.
  const limit = 0x100000000 - (0x100000000 % n);
  for (;;) {
    if (pool.i >= pool.buf.length) { crypto.getRandomValues(pool.buf); pool.i = 0; }
    const v = pool.buf[pool.i++];
    if (v < limit) return v % n;
  }
}

export function shuffle(arr) {
  const pool = { buf: new Uint32Array(4096), i: 4096 };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1, pool);
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export function sortLines(lines, sort) {
  const plain = new Intl.Collator(undefined, { sensitivity: 'variant' });
  const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'variant' });
  switch (sort) {
    case 'az': return lines.sort(plain.compare);
    case 'za': return lines.sort((a, b) => plain.compare(b, a));
    case 'natural': return lines.sort(natural.compare);
    case 'len-asc':
    case 'len-desc': {
      const dir = sort === 'len-asc' ? 1 : -1;
      const len = new Map();
      for (const l of lines) if (!len.has(l)) len.set(l, codePointLength(l));
      return lines.sort((a, b) => (len.get(a) - len.get(b)) * dir || natural.compare(a, b));
    }
    case 'reverse': return lines.reverse();
    case 'shuffle': return shuffle(lines);
    default: return lines;
  }
}

/**
 * Dedupe + sort. Returns the full output text, a short preview, stats and the removed-lines list.
 * onProgress(fraction) is called during long runs (used by the worker).
 */
export function processText(text, options = {}, onProgress = () => {}) {
  const opts = { ...DEFAULTS, ...options };
  const { lines, eol: dominant, mixed, trailing } = splitLines(text);
  const eol = opts.eol === 'crlf' ? '\r\n' : opts.eol === 'lf' ? '\n' : dominant;
  const n = lines.length;
  const keys = new Array(n);
  const map = new Map();
  let blank = 0;
  let invisible = 0;
  const step = 50000;

  for (let i = 0; i < n; i++) {
    const line = lines[i];
    if (INVISIBLE.test(line)) invisible++;
    if (opts.removeBlank && line.trim() === '') { keys[i] = null; blank++; continue; }
    const k = keyOf(line, opts);
    keys[i] = k;
    const e = map.get(k);
    if (e) { e.last = i; e.count++; } else map.set(k, { first: i, last: i, count: 1 });
    if (i % step === step - 1) onProgress((i / n) * 0.7);
  }

  const keep = (e, i) => {
    switch (opts.mode) {
      case 'last': return e.last === i;
      case 'dupes': return e.count > 1 && e.first === i;
      case 'unique': return e.count === 1;
      default: return e.first === i;
    }
  };
  let out = [];
  for (let i = 0; i < n; i++) {
    const k = keys[i];
    if (k !== null && keep(map.get(k), i)) out.push(lines[i]);
  }
  onProgress(0.8);

  const removed = [];
  for (const e of map.values()) {
    const kept = opts.mode === 'dupes' ? e.count > 1 : opts.mode === 'unique' ? e.count === 1 : true;
    const dropped = e.count - (kept ? 1 : 0);
    if (dropped > 0) removed.push({ line: lines[opts.mode === 'last' ? e.last : e.first], count: e.count, dropped });
  }
  if (blank) removed.push({ line: '', blank: true, count: blank, dropped: blank });

  out = sortLines(out, opts.sort);
  onProgress(0.95);

  const body = out.join(eol);
  const result = {
    text: out.length && trailing ? body + eol : body,
    preview: out.length > PREVIEW_LINES ? out.slice(0, PREVIEW_LINES).join('\n') : body,
    truncated: out.length > PREVIEW_LINES,
    removed,
    stats: { linesIn: n, linesOut: out.length, duplicates: n - blank - out.length, blank },
    eol: eol === '\r\n' ? 'CRLF' : eol === '\r' ? 'CR' : 'LF',
    mixed,
    invisible,
    mode: opts.mode,
  };
  onProgress(1);
  return result;
}

/** Plain-text version of the removed-lines list (for the copy button). */
export function removedToText(removed) {
  return removed.map((r) => `${r.blank ? '(blank line)' : r.line}\tappeared ${r.count} ${r.count === 1 ? 'time' : 'times'}`).join('\n');
}
