/*
 * Runs test/fixture.html in headless Chrome and fails if any assertion in it fails.
 *
 * This is the only test that exercises the DOM logic — the hide rules, the Sponsored
 * scrubber, the suggested-posts tail, the app-nag banner. The unit tests in route.test.mjs
 * only cover pure routing.
 *
 * Skips (exit 0) with a notice if no Chromium-family browser is installed, so `npm test`
 * still works on a machine without one.
 *
 * Run: node test/dom.mjs
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// The reel fixture is served under a real Instagram-shaped path so the script's own router
// classifies it as a reel, instead of the test stubbing the route.
const PAGES = [
  { name: 'feed page', path: '/test/fixture.html' },
  { name: 'reel page — snap scroller', path: '/reels/SNAP00001/' },
  { name: 'reel page — ambiguous, no snap', path: '/reels/AMBIG0001/' },
  { name: 'reel overlay on a DM route', path: '/direct/t/FIXTURE1/' },
];

// Which fixture a /reels/<code>/ request serves. The codes are arbitrary but must look like
// real shortcodes, so the router treats them as permalinks rather than collections.
const REEL_FIXTURES = { AMBIG0001: 'test/reel-ambiguous.html' };

async function findBrowser() {
  for (const path of BROWSERS) {
    try { await access(path); return path; } catch { /* keep looking */ }
  }
  return null;
}

const browser = await findBrowser();
if (!browser) {
  console.log('SKIP  test/dom.mjs — no Chromium-family browser found.');
  console.log('      Open test/fixture.html in any browser to run these checks by hand.');
  process.exit(0);
}

// Minimal static server. Paths are normalised and confined to the repo root.
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  let rel;
  if (pathname.startsWith('/reels/')) {
    rel = REEL_FIXTURES[pathname.split('/')[2]] ?? 'test/reel-fixture.html';
  } else if (pathname.startsWith('/direct/')) {
    rel = 'test/dm-reel-overlay.html';
  } else {
    rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  }
  const file = join(root, rel);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

let totalFailures = 0;

try {
  for (const page of PAGES) {
    const { stdout } = await execFileAsync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=4000',
      '--dump-dom',
      `http://127.0.0.1:${port}${page.path}`,
    ], { maxBuffer: 32 * 1024 * 1024 });

    const results = stdout.match(/<div id="results">([\s\S]*?)<\/div>/);
    if (!results) {
      console.error(`FAIL  ${page.name}: no results block — did the page load?`);
      totalFailures++;
      continue;
    }

    const lines = results[1]
      .replace(/<[^>]*>/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    console.log(`\n${page.name}  (${page.path})`);
    for (const line of lines) console.log(line.startsWith('FAIL') ? `  ✖ ${line}` : `  ✔ ${line}`);
    totalFailures += lines.filter((l) => l.startsWith('FAIL')).length;
  }
} finally {
  server.close();
}

if (totalFailures) {
  console.error(`\n${totalFailures} DOM check(s) failed.`);
  process.exit(1);
}
console.log('\nAll DOM checks passed.');
