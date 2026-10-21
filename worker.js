// worker.js — runs the dedupe off the main thread for very large inputs (module worker).
import { processText } from './dedupe.js';

self.onmessage = (e) => {
  const { id, text, opts } = e.data;
  try {
    let last = 0;
    const result = processText(text, opts, (p) => {
      if (p - last >= 0.05 || p === 1) { last = p; self.postMessage({ id, type: 'progress', p }); }
    });
    self.postMessage({ id, type: 'done', result });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err && err.message || err) });
  }
};
