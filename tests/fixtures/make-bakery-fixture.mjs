// Writes tests/fixtures/maple-street-bakery.txt from the fictional sample in dedupe.js.
// Run: node tests/fixtures/make-bakery-fixture.mjs
import { writeFileSync } from 'node:fs';
import { SAMPLE } from '../../dedupe.js';
writeFileSync(new URL('./maple-street-bakery.txt', import.meta.url), SAMPLE, 'utf8');
