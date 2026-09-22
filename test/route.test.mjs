/*
 * Zero-dependency tests for the pure logic inside insta-filter.user.js.
 *
 * The script is a single self-contained IIFE with no exports (deliberately — it has to be
 * one file the Userscripts app can load). So we pull the pure functions out of the source
 * by brace-matching and eval them against a stubbed `location`.
 *
 * Run: node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'insta-filter.user.js'), 'utf8');

/** Extract `function <name>(...) { ... }` from the source by matching braces. */
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} not found in insta-filter.user.js`);
  let depth = 0;
  let i = source.indexOf('{', start);
  const open = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  assert.ok(i < source.length, `unbalanced braces in ${name}`);
  return source.slice(start, i + 1);
}

/** Extract a top-level `const <name> = ...;` declaration. */
function extractConst(name) {
  const match = source.match(new RegExp(`const ${name} = [^;]+;`));
  assert.ok(match, `const ${name} not found in insta-filter.user.js`);
  return match[0];
}

/** Build a sandbox with a stubbed location, then eval the named functions into it. */
function load(names, consts = []) {
  const src = [...consts.map(extractConst), ...names.map(extractFunction)].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(
    'locationStub',
    `const location = locationStub; ${src}; return { ${names.join(', ')} };`,
  );
}

const factory = load(['reelShortcode', 'computeRoute'], ['REELS_SUBROUTES']);
const at = (pathname) => factory({ pathname });

test('reelShortcode parses the permalink shapes Instagram actually serves', () => {
  const { reelShortcode } = at('/');

  // The shape confirmed against live Instagram. It uses /reels/<code>/ — PLURAL — for a
  // single reel, sharing a prefix with the infinite feed at /reels/. Getting this wrong
  // meant a reel a friend sent was redirected away instead of played.
  // (Shortcodes here are synthetic; only their shape matters.)
  assert.equal(reelShortcode('/reels/Cx9mK2LpQrS/'), 'Cx9mK2LpQrS');
  assert.equal(reelShortcode('/reels/Cx9mK2LpQrS'), 'Cx9mK2LpQrS');

  // Legacy and profile-scoped singular forms.
  assert.equal(reelShortcode('/reel/Cx1y2z3/'), 'Cx1y2z3');
  assert.equal(reelShortcode('/someuser/reel/Cx1y2z3/'), 'Cx1y2z3');

  // The infinite feed itself is not a permalink.
  assert.equal(reelShortcode('/reels/'), null);

  // Browsable collections under /reels/ are not permalinks either — /reels/audio/<id>/
  // is a scrollable wall of reels, which is exactly what we are trying to escape.
  assert.equal(reelShortcode('/reels/audio/12345/'), null);
  assert.equal(reelShortcode('/reels/audio/'), null);
  assert.equal(reelShortcode('/reels/tags/'), null);

  assert.equal(reelShortcode('/p/Cx1y2z3/'), null);
  assert.equal(reelShortcode('/direct/inbox/'), null);
  assert.equal(reelShortcode('/'), null);
});

test('computeRoute classifies every route we care about', () => {
  const cases = [
    // a reel a friend sent: allowed, but contained
    ['/reels/Cx9mK2LpQrS/', 'reel'],
    ['/reel/Cx1y2z3/', 'reel'],
    ['/someuser/reel/Cx1y2z3/', 'reel'],

    // the blocked addictive surfaces
    ['/reels/', 'blocked'],
    ['/reels', 'blocked'],
    ['/reels/audio/12345/', 'blocked'],
    ['/reels/audio/', 'blocked'],
    ['/explore/', 'blocked'],
    ['/explore', 'blocked'],
    ['/explore/tags/cats/', 'blocked'],

    // messaging is untouched
    ['/direct/inbox/', 'dm'],
    ['/direct/t/12345/', 'dm'],

    // home gets redirected to the following feed
    ['/', 'home'],

    // everything else passes through
    ['/someuser/', 'pass'],
    ['/p/Cx1y2z3/', 'pass'],
    ['/accounts/edit/', 'pass'],
    ['/stories/someuser/12345/', 'pass'],
  ];

  for (const [pathname, expected] of cases) {
    assert.equal(at(pathname).computeRoute(), expected, `${pathname} should be "${expected}"`);
  }
});

test('injected stylesheet has balanced braces', () => {
  // A single unbalanced brace silently kills every rule after it, which would disable
  // the whole filter without any visible error.
  const match = source.match(/const CSS = `([\s\S]*?)`;/);
  assert.ok(match, 'CSS template literal not found');
  const css = match[1];
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    assert.ok(depth >= 0, 'closing brace without a matching opening brace');
  }
  assert.equal(depth, 0, 'unbalanced braces in the injected stylesheet');
  assert.ok(css.includes('data-if-route="blocked"'), 'blocked-route blanking rule missing');
  assert.ok(css.includes('if-reel-scroller'), 'reel containment rule missing');
});
