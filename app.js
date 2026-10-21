// app.js — Remove Duplicate Lines and Sort (ES module). Everything runs on this device; nothing is sent anywhere.
import { toast, downloadBlob, formatBytes, wireDropzone } from './site.js';
import { processText, removedToText, SAMPLE, DEFAULTS } from './dedupe.js';

const $ = (id) => document.getElementById(id);
const els = {
  input: $('input'), output: $('output'), inCount: $('input-count'), outCount: $('output-count'),
  note: $('preview-note'), empty: $('empty-state'), sample: $('load-sample'), clear: $('clear-input'),
  ignoreCase: $('opt-case'), trim: $('opt-trim'), collapse: $('opt-collapse'), removeBlank: $('opt-blank'),
  mode: $('opt-mode'), sort: $('opt-sort'), eol: $('opt-eol'),
  copy: $('copy'), download: $('download'), swap: $('swap'), kbd: $('copy-kbd'),
  progress: $('progress'), results: $('results'),
  removed: $('removed'), removedCount: $('removed-count'), removedList: $('removed-list'),
  removedMore: $('removed-more'), copyRemoved: $('copy-removed'),
  zone: $('dropzone'), file: $('file-input'),
};

const MAX_BYTES = 50 * 1024 * 1024;
const WORKER_LINES = 200_000;
const REMOVED_RENDER = 2000;
const ALLOWED_EXT = /\.(txt|csv|log|tsv|text)$/i;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);
els.kbd.textContent = isMac ? '⌘ Enter' : 'Ctrl+Enter';

let current = null; // last full result
let runId = 0;
let worker = null;
let timer = 0;
let fileErrors = []; // shown until the next file load
let scrollOnResult = false;

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** Honest percentage: never rounds up to 100% (or down to 0%) unless it really is. */
export function pct(part, total) {
  if (!total || !part) return '0%';
  if (part === total) return '100%';
  const v = (part / total) * 100;
  if (v < 0.1) return '<0.1%';
  return `${Math.min(Math.floor(v * 10) / 10, 99.9)}%`;
}

function options() {
  return {
    ignoreCase: els.ignoreCase.checked, trim: els.trim.checked, collapse: els.collapse.checked,
    removeBlank: els.removeBlank.checked, mode: els.mode.value, sort: els.sort.value, eol: els.eol.value,
  };
}

function quickLineCount(text) {
  let n = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
  return n || (text.includes('\r') ? text.split('\r').length : 0);
}

function debounceMs(text) {
  const len = text.length;
  const base = len < 20_000 ? 60 : len < 500_000 ? 200 : 450;
  return isIOS ? base * 2 + 100 : base;
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(run, debounceMs(els.input.value));
}

function setProgress(p) {
  const v = Math.round(p * 100);
  els.progress.firstElementChild.style.width = `${v}%`;
  els.progress.setAttribute('aria-valuenow', String(v));
}

function run() {
  clearTimeout(timer);
  const text = els.input.value;
  const id = ++runId;
  updateEmpty(text);
  if (!text) { render(null); return Promise.resolve(); }
  if (quickLineCount(text) < WORKER_LINES || typeof Worker === 'undefined') {
    try { render(processText(text, options())); } catch (err) { showError(`Could not process the list: ${err.message}`); }
    return Promise.resolve();
  }
  // Large input: run in a worker so typing and scrolling stay smooth.
  if (worker) worker.terminate();
  worker = new Worker('./worker.js', { type: 'module' });
  setProgress(0);
  els.progress.hidden = false;
  els.results.setAttribute('aria-busy', 'true');
  return new Promise((resolve) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.type === 'progress') { setProgress(msg.p); return; }
      els.progress.hidden = true;
      els.results.removeAttribute('aria-busy');
      worker.terminate(); worker = null;
      if (msg.type === 'done') render(msg.result);
      else showError(`Could not process the list: ${msg.message}`);
      resolve();
    };
    worker.onerror = (e) => {
      els.progress.hidden = true;
      els.results.removeAttribute('aria-busy');
      showError(`Could not process the list: ${e.message || 'the background worker failed'}`);
      resolve();
    };
    worker.postMessage({ id, text, opts: options() });
  });
}

function updateEmpty(text) {
  const has = text.length > 0;
  els.sample.hidden = has;
  els.clear.hidden = !has;
  els.empty.firstElementChild.textContent = has ? 'Start over?' : 'Empty? Try the bakery list.';
}

function alertBox(kind, text) {
  const div = document.createElement('div');
  div.className = `alert alert--${kind}`;
  if (kind === 'error') div.setAttribute('role', 'alert');
  div.textContent = text;
  return div;
}

function showError(message) {
  fileErrors = [message];
  renderAlerts();
}

function renderAlerts(extra = []) {
  els.results.querySelectorAll('.alert').forEach((a) => a.remove());
  const nodes = [...fileErrors.map((m) => alertBox('error', m)), ...extra];
  els.results.prepend(...nodes);
}

function stat(label, value, cls = '') {
  const d = document.createElement('div');
  d.className = 'dd-stat';
  const v = document.createElement('span');
  v.className = `dd-stat__value stat ${cls}`;
  v.textContent = value;
  const l = document.createElement('span');
  l.className = 'dd-stat__label';
  l.textContent = label;
  d.append(v, l);
  return d;
}

function render(result) {
  const hadResult = Boolean(current);
  current = result;
  const on = Boolean(result);
  els.copy.disabled = els.download.disabled = els.swap.disabled = !on;
  els.removed.hidden = !on || !result.removed.length;
  els.results.querySelectorAll('.result').forEach((r) => r.remove());
  if (!on) {
    els.output.value = '';
    els.inCount.textContent = plural(0, 'line');
    els.outCount.textContent = plural(0, 'line');
    els.note.hidden = true;
    renderAlerts();
    return;
  }
  const s = result.stats;
  els.output.value = result.preview;
  els.inCount.textContent = plural(s.linesIn, 'line');
  els.outCount.textContent = plural(s.linesOut, 'line');
  els.note.hidden = !result.truncated;
  if (result.truncated) els.note.textContent = `Showing the first 5,000 of ${s.linesOut.toLocaleString()} lines. Copy and Download use the full result.`;

  const card = document.createElement('div');
  card.className = 'result dd-summary';
  card.id = 'summary';
  const removedLabel = result.mode === 'dupes' ? 'lines filtered out' : 'duplicates removed';
  card.append(
    stat('lines in', s.linesIn.toLocaleString()),
    stat('lines out', s.linesOut.toLocaleString(), 'stat--ok'),
    stat(removedLabel, s.duplicates.toLocaleString(), s.duplicates ? 'stat--warn' : ''),
    stat('blank lines removed', s.blank.toLocaleString()),
  );
  card.querySelector('.dd-stat:nth-child(1) .dd-stat__value').id = 'stat-in';
  card.querySelector('.dd-stat:nth-child(2) .dd-stat__value').id = 'stat-out';
  card.querySelector('.dd-stat:nth-child(3) .dd-stat__value').id = 'stat-dupes';
  card.querySelector('.dd-stat:nth-child(4) .dd-stat__value').id = 'stat-blank';
  const dropped = s.linesIn - s.linesOut;
  const foot = document.createElement('p');
  foot.className = 'dd-summary__foot';
  foot.textContent = `${pct(dropped, s.linesIn)} of lines dropped · line endings ${result.eol}${result.mixed && els.eol.value === 'auto' ? ' (input had mixed endings, normalised to the most common one)' : ''}`;
  card.append(foot);
  els.results.append(card);

  const hints = [];
  if (result.invisible) {
    hints.push(alertBox('info', `${plural(result.invisible, 'line')} contain invisible characters such as non-breaking or zero-width spaces. `
      + 'Lines that differ only by these count as different. Trim spaces removes them at the line edges; Collapse inner spaces treats non-breaking spaces inside a line as normal spaces.'));
  }
  renderAlerts(hints);
  renderRemoved(result.removed);

  if (scrollOnResult || !hadResult) {
    scrollOnResult = false;
    card.scrollIntoView({ block: 'nearest' });
  }
}

function renderRemoved(removed) {
  els.removedCount.textContent = removed.reduce((n, r) => n + r.dropped, 0).toLocaleString();
  const frag = document.createDocumentFragment();
  for (const r of removed.slice(0, REMOVED_RENDER)) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.className = 'dd-removed__line';
    if (r.blank) { code.textContent = '(blank line)'; code.classList.add('is-blank'); } else code.textContent = r.line;
    const meta = document.createElement('span');
    meta.className = 'dd-removed__meta';
    const extra = r.dropped === r.count ? 'all copies dropped' : `${r.dropped} dropped`;
    meta.textContent = `appeared ${plural(r.count, 'time')} · ${extra}`;
    li.append(code, meta);
    frag.append(li);
  }
  els.removedList.replaceChildren(frag);
  els.removedMore.hidden = removed.length <= REMOVED_RENDER;
  if (removed.length > REMOVED_RENDER) els.removedMore.textContent = `Showing ${REMOVED_RENDER.toLocaleString()} of ${removed.length.toLocaleString()} entries. Copy removed list includes all of them.`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for Safari and non-secure contexts: select a temporary text area and copy.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function copyOutput() {
  if (!current) { toast('Nothing to copy yet'); return; }
  const ok = await copyText(current.text);
  toast(ok ? `Copied ${plural(current.stats.linesOut, 'line')}` : 'Copy failed: select the output and copy manually');
}

function downloadOutput() {
  if (!current) return;
  downloadBlob(new Blob([current.text], { type: 'text/plain;charset=utf-8' }), 'unique-lines.txt');
  toast(`Saved unique-lines.txt (${formatBytes(new Blob([current.text]).size)})`);
}

async function loadFiles(files) {
  fileErrors = [];
  const ok = [];
  for (const f of files) {
    if (!ALLOWED_EXT.test(f.name) && !/^text\/(plain|csv)$/.test(f.type)) fileErrors.push(`${f.name} was skipped: only .txt, .csv and .log text files are supported.`);
    else if (f.size > MAX_BYTES) fileErrors.push(`${f.name} is ${formatBytes(f.size)}, which is over the 50 MB limit. Split it into smaller files.`);
    else ok.push(f);
  }
  if (!ok.length) { renderAlerts(); scrollAlert(); return; }
  try {
    const texts = await Promise.all(ok.map((f) => f.text()));
    els.input.value = texts.map((t) => t.replace(/(\r\n|\r|\n)$/, '')).join('\n');
    scrollOnResult = true;
    await run();
    toast(`Loaded ${ok.map((f) => f.name).join(', ')} — nothing was uploaded`);
  } catch (err) {
    fileErrors.push(`Could not read the file: ${err.message}`);
    renderAlerts();
  }
}

function scrollAlert() {
  const a = els.results.querySelector('.alert');
  if (a) a.scrollIntoView({ block: 'nearest' });
}

function loadText(text) {
  fileErrors = [];
  els.input.value = text;
  scrollOnResult = true;
  return run();
}

// Wiring
els.input.addEventListener('input', schedule);
for (const el of [els.ignoreCase, els.trim, els.collapse, els.removeBlank, els.mode, els.sort, els.eol]) el.addEventListener('change', run);
els.sample.addEventListener('click', () => { loadText(SAMPLE); els.input.focus(); });
els.clear.addEventListener('click', () => { fileErrors = []; els.input.value = ''; run(); els.input.focus(); });
els.copy.addEventListener('click', copyOutput);
els.download.addEventListener('click', downloadOutput);
els.swap.addEventListener('click', () => {
  if (!current) return;
  loadText(current.text);
  toast('Output moved into the input');
});
els.copyRemoved.addEventListener('click', async () => {
  if (!current) return;
  const ok = await copyText(removedToText(current.removed));
  toast(ok ? 'Copied the removed lines list' : 'Copy failed');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); copyOutput(); }
});
wireDropzone(els.zone, els.file, loadFiles);
// The text areas also accept dropped files.
for (const ta of [els.input, els.output]) {
  ta.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  ta.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) { e.preventDefault(); loadFiles(files); }
  });
}

// Restore option defaults in case the browser kept form state across reloads.
els.ignoreCase.checked = DEFAULTS.ignoreCase; els.trim.checked = DEFAULTS.trim;
els.collapse.checked = DEFAULTS.collapse; els.removeBlank.checked = DEFAULTS.removeBlank;
els.mode.value = DEFAULTS.mode; els.sort.value = DEFAULTS.sort; els.eol.value = DEFAULTS.eol;
run();

// Called by the factory's screenshot script to show the tool in a realistic, fictional state.
window.__demo = async () => {
  const res = await fetch('./tests/fixtures/maple-street-bakery.txt');
  await loadText(await res.text());
  els.sort.value = 'natural';
  await run();
  els.removed.open = true;
};
