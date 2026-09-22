// ==UserScript==
// @name         Insta Filter
// @namespace    local.insta-filter
// @version      0.4.0
// @description  Strips Reels, Explore and the algorithmic feed from Instagram. Runs entirely on-device; makes no network requests of its own.
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @match        https://m.instagram.com/*
// @run-at       document-start
// @inject-into  content
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

/*
 * Insta Filter
 * ------------
 * Five modules, in load order:
 *   1. STYLE      static CSS injected at document-start (no flash of unfiltered content)
 *   2. ROUTER     maps location.pathname -> a route, redirects the blocked ones
 *   3. REEL LOCK  a reel opened from a DM plays, but you cannot swipe to the next one
 *   4. SCRUBBER   hides Sponsored / Suggested posts that leak into the feed
 *   5. HEALTH     tells you which selector broke when Instagram changes its DOM
 *
 * Escape hatches:
 *   ?if=off      disable for this browsing session (survives SPA navigation)
 *   ?ifdebug=1   log a table of every rule and its live match count
 */

(() => {
  'use strict';

  // Was @noframes. Done in code instead: a metadata key that takes no value is a parser
  // risk, and this is exactly equivalent.
  if (window.top !== window.self) return;

  const CONFIG = {
    // Where "home" goes. Instagram's undocumented chronological, following-only feed.
    home: '/?variant=following',

    // Reel containment strength. `false` uses overflow:hidden on the reel scroller, which
    // leaves comments scrollable. If you can still swipe to the next reel during testing
    // (verification step 6), flip this to true: it also sets touch-action to block the
    // vertical pan gesture outright, at the cost of scrolling inside the reel view.
    hardScrollLock: false,

    // Tiny corner badge confirming the script is alive. Userscripts can fail silently
    // after an Instagram update; this is how you notice at a glance.
    badge: true,

    // Swallow upward swipes while a full-screen reel is open. This is the containment that
    // does not care how Instagram implements the swipe — clamping a scroll container is
    // useless if the player advances with CSS transforms instead, which is the likely
    // reason every scroll-based attempt did nothing. Downward swipes stay live so the
    // player can still be dismissed.
    containReelGestures: true,
  };

  // ---------------------------------------------------------------- utilities

  const TAG = '[insta-filter]';
  const log = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  const params = () => new URLSearchParams(location.search);

  // sessionStorage throws in some locked-down contexts. A throw at document-start would
  // kill the whole script before a single rule is applied, so every access is guarded.
  const store = {
    get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* ignore */ } },
    remove(key) { try { sessionStorage.removeItem(key); } catch { /* ignore */ } },
  };

  function hide(el, reason) {
    if (!el || el.dataset.ifHidden) return false;
    el.dataset.ifHidden = reason;
    el.style.setProperty('display', 'none', 'important');
    return true;
  }

  // ------------------------------------------------------------- kill switch

  // Sticky for the session so it survives SPA navigation, not just the one page load.
  const SESSION_OFF = 'if:off';
  if (params().get('if') === 'off') store.set(SESSION_OFF, '1');
  if (params().get('if') === 'on') store.remove(SESSION_OFF);
  const DISABLED = store.get(SESSION_OFF) === '1';

  const DEBUG = params().get('ifdebug') === '1';

  if (DISABLED) {
    log('disabled for this session (?if=on to re-enable)');
    document.documentElement.dataset.ifRoute = 'off';
    addEventListener('DOMContentLoaded', () => mountBadge('IF off'));
    return;
  }

  // ------------------------------------------------------- module 1: STYLE

  const CSS = `
/* --- navigation: Reels and Explore, by route rather than by obfuscated class --- */
a[href="/reels/"], a[href^="/reels/"],
a[href="/explore/"], a[href^="/explore/"] { display: none !important; }

/* :has() lets us hide the ancestor link of an icon. Safari 16.4+. */
a:has(svg[aria-label="Reels"]),
a:has(svg[aria-label="Explore"]),
div[role="button"]:has(svg[aria-label="Reels"]),
div[role="button"]:has(svg[aria-label="Explore"]) { display: none !important; }

/* --- blocked routes: keep the page blank until the redirect lands, so no flash --- */
:root[data-if-route="blocked"] body { display: none !important; }

/* --- single-reel containment --- */
:root[data-if-route="reel"] [aria-label="Next"],
:root[data-if-route="reel"] [aria-label="Previous"],
:root[data-if-route="reel"] button:has(svg[aria-label="Next"]),
:root[data-if-route="reel"] button:has(svg[aria-label="Previous"]),
:root[data-if-route="reel"] div[role="button"]:has(svg[aria-label="Next"]),
:root[data-if-route="reel"] div[role="button"]:has(svg[aria-label="Previous"]) {
  display: none !important;
}

/* Clamp the document itself. On mobile the reel viewer advances by scrolling the page,
   not the inner container the desktop audit found, so clamping only that container did
   nothing. overflow:hidden on html/body stops document scrolling while leaving genuine
   inner scrollers — a comments sheet, say — working normally. */
:root[data-if-route="reel"],
:root[data-if-route="reel"] body {
  overflow: hidden !important;
  overscroll-behavior: none !important;
}

/* Ungated on purpose. The class is only ever applied to a container we have positively
   identified as a reel stack, and that stack can appear on any route — opening a reel from
   a DM renders it in place without changing the URL at all. */
.if-reel-scroller {
  overflow: hidden !important;
  scroll-snap-type: none !important;
  overscroll-behavior: none !important;
}

/* Nuclear option, CONFIG.hardScrollLock. Kills the vertical pan gesture outright, at the
   cost of scrolling anywhere on the reel page. */
:root[data-if-route="reel"].if-hard-lock,
:root[data-if-route="reel"].if-hard-lock body,
.if-hard-lock .if-reel-scroller {
  touch-action: pan-x !important;
}
.if-reel-extra { display: none !important; }
`;

  (function injectStyle() {
    const style = document.createElement('style');
    style.id = 'if-style';
    style.textContent = CSS;
    // At document-start <head> may not exist yet; documentElement always does.
    (document.head || document.documentElement).appendChild(style);
  })();

  if (CONFIG.hardScrollLock) document.documentElement.classList.add('if-hard-lock');

  // ------------------------------------------------------- module 2: ROUTER

  // Sub-routes under /reels/ that are browsable collections, not single reels. These stay
  // blocked; everything else with one segment after /reels/ is a permalink.
  const REELS_SUBROUTES = new Set(['audio', 'tags', 'trending', 'remix', 'create', 'explore']);

  /**
   * Instagram serves a single reel at /reels/<shortcode>/ — PLURAL, the same prefix as the
   * infinite feed at /reels/. Distinguishing them is what makes "watch the reel a friend
   * sent" work while the endless feed stays blocked, so it is worth the care.
   *
   *   /reels/                  -> feed, blocked (no segment)
   *   /reels/Cx9mK2LpQrS/      -> permalink, contained
   *   /reels/audio/12345/      -> collection, blocked (two segments)
   *   /reel/<code>/            -> legacy permalink, still honoured
   *   /<username>/reel/<code>/ -> profile-scoped permalink
   */
  function reelShortcode(pathname) {
    const singular = pathname.match(/^\/(?:[^/]+\/)?reel\/([^/]+)/);
    if (singular) return singular[1];

    const plural = pathname.match(/^\/reels\/([^/]+)\/?$/);
    if (plural && !REELS_SUBROUTES.has(plural[1].toLowerCase())) return plural[1];

    return null;
  }

  function computeRoute() {
    const p = location.pathname;
    if (reelShortcode(p)) return 'reel';
    if (/^\/reels(\/|$)/.test(p)) return 'blocked';
    if (/^\/explore(\/|$)/.test(p)) return 'blocked';
    if (/^\/direct(\/|$)/.test(p)) return 'dm';
    if (p === '/') return 'home';
    return 'pass';
  }

  // A redirect loop would leave a blank page, so cap it. If Instagram ever stops honouring
  // ?variant=following we stop fighting, let the page render, and lean on the scrubber.
  const GUARD_KEY = 'if:redirects';
  function redirectAllowed() {
    let stamps;
    try { stamps = JSON.parse(store.get(GUARD_KEY) || '[]'); } catch { stamps = []; }
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < 10000);
    if (stamps.length >= 3) {
      warn('redirect guard tripped — letting the page render unredirected.');
      return false;
    }
    stamps.push(now);
    store.set(GUARD_KEY, JSON.stringify(stamps));
    return true;
  }

  function goHome() {
    if (!redirectAllowed()) {
      document.documentElement.dataset.ifRoute = 'pass';
      return;
    }
    location.replace(CONFIG.home);
  }

  let lastHref = location.href;

  function applyRoute() {
    const route = computeRoute();
    document.documentElement.dataset.ifRoute = route;

    if (route === 'blocked') { goHome(); return; }

    if (route === 'home' && params().get('variant') !== 'following') { goHome(); return; }

    if (route === 'reel') enterReel(reelShortcode(location.pathname));
    else leaveReel();
  }

  function onNavigate() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (DEBUG) log('navigate ->', location.pathname + location.search);
    applyRoute();
    scheduleScrub();
  }

  (function installHistoryHooks() {
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        queueMicrotask(onNavigate);
        return result;
      };
    }
    addEventListener('popstate', onNavigate);
    // Instagram sometimes changes the URL in ways neither hook catches.
    setInterval(onNavigate, 400);
  })();

  // ---------------------------------------------------- module 3: REEL LOCK

  let lockedReel = null;
  let lockedPath = null;
  let softRevertUsed = false;

  function enterReel(shortcode) {
    if (!shortcode) return;
    if (lockedReel === shortcode) return;

    if (lockedReel && shortcode !== lockedReel) {
      // The SPA advanced to a different reel. Put it back.
      if (!softRevertUsed) {
        softRevertUsed = true;
        warn('reel advanced to', shortcode, '- reverting to', lockedReel);
        history.replaceState(null, '', lockedPath);
        lastHref = location.href;
        return;
      }
      // The soft revert did not stick (the SPA already swapped the DOM), so force it.
      warn('reel lock escalating to a hard reload of', lockedReel);
      location.replace(lockedPath);
      return;
    }

    lockedReel = shortcode;
    lockedPath = location.pathname + location.search;
    softRevertUsed = false;
    if (DEBUG) log('reel locked to', shortcode);
  }

  function leaveReel() {
    if (!lockedReel) return;
    if (DEBUG) log('reel lock released');
    lockedReel = null;
    lockedPath = null;
    softRevertUsed = false;
  }

  /**
   * Find the element that actually scrolls the reel viewer and tag it, so the stylesheet
   * can clamp it. Instagram's class names are obfuscated, so identify it structurally:
   * a scrollable box inside <main> that is taller than it is tall, preferring one that
   * uses scroll snapping (the signature of a swipe-to-next-reel container).
   */
  function tagReelScroller() {
    const main = document.querySelector('main');
    if (!main) return 0;

    // getComputedStyle over every div in <main> is far too expensive to repeat every 200ms
    // while a video plays, so only run the search until the scroller has been found.
    let tagged = main.querySelectorAll('.if-reel-scroller').length;

    if (!tagged) {
      // Two passes, because "a scrollable div" is far too loose a description — the live
      // audit matched the DM conversation list with it. The real reel scroller is a
      // scroll-snap container (observed: scroll-snap-type "y mandatory"), while DM lists
      // and comment panels are plain overflow. Prefer snap; fall back only when no snap
      // container exists, since clamping a comments panel by mistake would break it.
      const candidates = [...main.querySelectorAll('div, section')]
        .map((el) => ({ el, cs: getComputedStyle(el) }))
        .filter(({ el }) => el.scrollHeight > el.clientHeight + 40);

      const snapping = candidates.filter(({ cs }) => cs.scrollSnapType && cs.scrollSnapType !== 'none');
      const chosen = snapping.length
        ? snapping
        : candidates.filter(({ cs }) => /(auto|scroll)/.test(cs.overflowY));

      if (!snapping.length && chosen.length > 1) {
        // No snap container and several scrollable boxes: too ambiguous to clamp safely.
        // The URL lock still contains the reel, so bail rather than break the page.
        warn('no scroll-snap container and', chosen.length, 'scrollable candidates — not clamping');
        return 0;
      }

      for (const { el } of chosen) { el.classList.add('if-reel-scroller'); tagged++; }
    }

    // Hide every queued reel after the first. This must run *after* tagging, in the same
    // call: the MutationObserver watches childList but not attributes, so adding the
    // scroller class does not schedule another pass to come back and do it.
    //
    // The reel page has no <article> elements, so go by the scroller's own children — but
    // only when there are enough to look like a list of reels. A one- or two-child scroller
    // is more likely chrome wrapping the content, where hiding child 1 would blank the reel.
    for (const scroller of main.querySelectorAll('.if-reel-scroller')) {
      if (scroller.children.length < 3) continue;
      [...scroller.children].forEach((child, i) => {
        if (i > 0) child.classList.add('if-reel-extra');
      });
    }

    // Legacy shape, harmless when absent.
    const articles = main.querySelectorAll('article');
    for (let i = 1; i < articles.length; i++) articles[i].classList.add('if-reel-extra');

    return tagged;
  }

  // ------------------------------------------- module 3b: REEL OVERLAY (URL-independent)

  /**
   * Opening a reel from a DM does not navigate. Observed on device: the URL stays at
   * /direct/t/<id>/ while a full-screen reel player opens over the thread, and swiping
   * moves through "Suggested" reels — the algorithmic stack — without the path ever
   * changing. The router is blind to this, so the reel stack has to be found in the DOM.
   *
   * The signal is a vertical scroll-snap container. Measured across every page we audited:
   * the feed, the DM inbox and a DM thread all report scroll-snap "none"; only the reel
   * stack snaps. Searching upward from <video> elements keeps this cheap — there are a
   * handful of videos on a page, versus thousands of divs.
   */
  function findReelStack() {
    for (const video of document.querySelectorAll('video')) {
      let node = video.parentElement;
      for (let depth = 0; depth < 12 && node; depth++) {
        const snap = getComputedStyle(node).scrollSnapType || '';
        if (/\by\b|\bboth\b/.test(snap) && node.scrollHeight > node.clientHeight + 40) return node;
        node = node.parentElement;
      }
    }
    return null;
  }

  /**
   * Is a full-screen reel player open? Deliberately independent of both the URL and the
   * swipe mechanism: it just asks whether a video is filling the viewport.
   *
   * A reel is full-bleed. A video post in the feed is roughly square, so on a tall phone
   * (390x844, say) it is about 390px tall against a 506px threshold — comfortably below.
   */
  function reelOverlayPresent() {
    for (const video of document.querySelectorAll('video')) {
      const r = video.getBoundingClientRect();
      if (r.height > innerHeight * 0.6 && r.width > innerWidth * 0.5) return true;
    }
    return false;
  }

  (function installGestureContainment() {
    if (!CONFIG.containReelGestures) return;

    let startY = 0;
    let armed = false;

    // Evaluated once per touch, not per move: touchmove fires continuously and
    // getBoundingClientRect over every video on each one would make the page crawl.
    addEventListener('touchstart', (e) => {
      startY = e.touches[0]?.clientY ?? 0;
      armed = reelOverlayPresent();
    }, { passive: true, capture: true });

    addEventListener('touchmove', (e) => {
      if (!armed) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY;
      // Negative dy is the finger travelling up, which is what advances to the next reel.
      // Downward is left alone so swipe-to-dismiss keeps working and you are never trapped.
      if (dy >= -4) return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false, capture: true });
  })();

  let reelStack = null;
  let reelStackTop = 0;

  function containReelStack() {
    const stack = findReelStack();

    if (!stack) { reelStack = null; return 0; }
    if (stack === reelStack) return 1;

    // Freeze at wherever the stack currently sits rather than jumping to the top: the reel
    // on screen is the one the friend sent, and scrolling it away would be the bug.
    reelStack = stack;
    reelStackTop = stack.scrollTop;
    stack.classList.add('if-reel-scroller');

    // CSS clamping alone has already been observed to lose; a scroll listener that puts the
    // position back is the belt to its braces, and costs nothing when nothing scrolls.
    stack.addEventListener('scroll', () => {
      if (stack.scrollTop !== reelStackTop) stack.scrollTop = reelStackTop;
    }, { passive: true });

    if (DEBUG) log('reel stack contained at scrollTop', reelStackTop);
    return 1;
  }

  // ----------------------------------------------------- module 4: SCRUBBER

  // Exact matches only. A substring search would eat a friend's caption that happens to
  // contain the word "sponsored".
  const AD_LABELS = new Set(['Sponsored', 'Suggested for you', 'Suggested post']);
  const TAIL_LABEL = new Set(['Suggested posts']);

  // Instagram's feed posts have no <header> element (the live audit found zero), so the ad
  // marker cannot be scoped by element. Scope it geometrically instead: the marker sits in
  // the post's top chrome, while a caption sits below the media.
  //
  // Two layers of protection against eating a friend's post:
  //   1. exact text-node match — a caption reading "...felt Sponsored but..." is a single
  //      text node and never equals "Sponsored"
  //   2. the geometric gate below, for the rare caption that is *only* the word
  //
  // Deliberately biased to fail open: a missed ad is visible clutter, a false positive
  // silently hides something a friend posted. The first is far cheaper than the second.
  const AD_LABEL_MAX_DY = 120;

  function adLabelIn(article) {
    const rect = article.getBoundingClientRect();
    const limit = Math.max(AD_LABEL_MAX_DY, rect.height * 0.2);
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    let node, seen = 0;

    while ((node = walker.nextNode()) && seen++ < 400) {
      const text = node.textContent.trim();
      if (!text || !AD_LABELS.has(text)) continue;
      const el = node.parentElement;
      if (!el) continue;
      const dy = el.getBoundingClientRect().top - rect.top;
      if (dy >= 0 && dy <= limit) return text;
    }
    return null;
  }

  function scrubArticles() {
    let hidden = 0;
    for (const article of document.querySelectorAll('article')) {
      if (article.dataset.ifHidden) { hidden++; continue; }
      const label = adLabelIn(article);
      if (label && hide(article, label)) hidden++;
    }
    return hidden;
  }

  /**
   * Instagram ends the feed with a "Suggested posts" divider followed by an endless tail.
   * Hide the divider and everything after it. Heuristic: climb from the label to the
   * ancestor that sits alongside the feed's other post wrappers, then hide its siblings.
   */
  function scrubSuggestedTail() {
    const main = document.querySelector('main');
    if (!main) return 0;

    let divider = null;
    for (const el of main.querySelectorAll('span, h1, h2, h3, div')) {
      if (el.children.length) continue; // leaf nodes only
      if (TAIL_LABEL.has(el.textContent.trim())) { divider = el; break; }
    }
    if (!divider) return 0;

    let node = divider;
    for (let depth = 0; depth < 8 && node.parentElement; depth++) {
      const parent = node.parentElement;
      const feedish = [...parent.children].filter((c) => c.querySelector('article')).length >= 2;
      if (feedish) break;
      node = parent;
    }

    // Safety rails. This hides `node` and everything after it, so an overshooting climb
    // could blank the whole feed. The suggested tail always comes *after* real posts, so
    // a node that is its parent's first child, or an only child, means we climbed wrong.
    const parent = node.parentElement;
    if (!parent || node === document.body || node.tagName === 'MAIN') return 0;
    if (parent.children.length < 2 || node === parent.firstElementChild) {
      if (DEBUG) warn('suggested-tail climb overshot; skipping to avoid blanking the feed');
      return 0;
    }

    let hidden = 0;
    for (let sib = node; sib; sib = sib.nextElementSibling) {
      if (hide(sib, 'suggested-tail')) hidden++;
    }
    return hidden;
  }

  /**
   * The "Suggested for you" account-recommendation panel. The live audit found it sitting
   * loose inside <main> (chain: span < div x8 < main[role=main]) rather than inside an
   * <article>, so neither of the scrubbers above sees it.
   *
   * Climbing a chain that deep is how you accidentally hide a whole feed, so the climb is
   * bounded by a property rather than a depth guess: stop at the last ancestor that
   * contains no <article>. A container holding a real post can never be selected, which
   * makes the worst case "a panel stays visible" instead of "the feed disappears".
   */
  function scrubSuggestionPanels() {
    const main = document.querySelector('main');
    if (!main) return 0;
    let hidden = 0;

    for (const el of main.querySelectorAll('span, h1, h2, h3, div')) {
      if (el.children.length) continue;                 // leaf nodes only
      if (el.textContent.trim() !== 'Suggested for you') continue;
      if (el.closest('article')) continue;              // in-feed case, handled above

      let node = el;
      let outermost = null;
      for (let depth = 0; depth < 10 && node.parentElement && node.parentElement !== main; depth++) {
        node = node.parentElement;
        if (node.querySelector('article')) break;       // never hide a post's container
        outermost = node;
      }
      if (outermost && hide(outermost, 'suggestion-panel')) hidden++;
    }
    return hidden;
  }

  // Best effort: Instagram's mobile web "Open the app" nags.
  const APP_NAG = new Set(['Open the app', 'Open app', 'Use the app', 'Switch to the app']);
  function scrubAppNag() {
    let hidden = 0;
    for (const el of document.querySelectorAll('button, a, div[role="button"]')) {
      if (!APP_NAG.has(el.textContent.trim())) continue;
      // Climb to the fixed/sticky banner that contains the button. If there isn't one,
      // this is an ordinary in-page link, not a nag — leave it alone rather than hiding
      // whatever happens to sit six levels up.
      let node = el;
      let banner = null;
      for (let depth = 0; depth < 6 && node; depth++) {
        const position = getComputedStyle(node).position;
        if (position === 'fixed' || position === 'sticky') { banner = node; break; }
        node = node.parentElement;
      }
      if (banner && hide(banner, 'app-nag')) hidden++;
    }
    return hidden;
  }

  // ------------------------------------------------------ scheduling

  let scrubQueued = false;
  let lastScrub = 0;

  function scheduleScrub() {
    if (scrubQueued) return;
    scrubQueued = true;
    requestAnimationFrame(() => {
      scrubQueued = false;
      const now = Date.now();
      if (now - lastScrub < 200) { setTimeout(scheduleScrub, 200); return; }
      lastScrub = now;
      runScrub();
    });
  }

  function runScrub() {
    scrubArticles();
    scrubSuggestedTail();
    scrubSuggestionPanels();
    scrubAppNag();
    // Always: the overlay is not tied to a route.
    containReelStack();
    document.documentElement.dataset.ifOverlay = reelOverlayPresent() ? '1' : '0';
    if (document.documentElement.dataset.ifRoute === 'reel') tagReelScroller();
    updateBadge();
  }

  // ------------------------------------------------------- module 5: HEALTH

  // Each rule reports how many nodes it currently matches. A rule that used to match
  // something and now matches nothing is a selector Instagram just broke.
  const RULES = [
    ['nav.reels', () => document.querySelectorAll('a[href="/reels/"], a:has(svg[aria-label="Reels"])').length],
    ['nav.explore', () => document.querySelectorAll('a[href="/explore/"], a:has(svg[aria-label="Explore"])').length],
    ['feed.articles', () => document.querySelectorAll('article').length],
    ['feed.hidden', () => document.querySelectorAll('[data-if-hidden]').length],
    ['feed.suggestPanel', () => document.querySelectorAll('[data-if-hidden="suggestion-panel"]').length],
    ['reel.scroller', () => document.querySelectorAll('.if-reel-scroller').length],
  ];

  async function health() {
    const counts = {};
    for (const [name, probe] of RULES) {
      try { counts[name] = probe(); } catch (e) { counts[name] = `error: ${e.message}`; }
    }

    if (DEBUG) console.table(counts);

    // Compare against the best count we have ever seen for this rule.
    if (typeof GM === 'undefined' || !GM.getValue) return counts;
    for (const [name] of RULES) {
      const key = `baseline:${name}`;
      const baseline = Number(await GM.getValue(key, 0));
      const current = Number(counts[name]) || 0;
      if (current > baseline) await GM.setValue(key, current);
      else if (baseline > 0 && current === 0) {
        warn(`rule "${name}" matched ${baseline} nodes before and 0 now — Instagram probably changed its DOM. See docs/debugging.md`);
      }
    }
    return counts;
  }

  // ---------------------------------------------------------------- badge

  const VERSION = '0.4.0';

  // Debug mode gets a full-width bar at the top, not the subtle corner badge. On a phone the
  // corner badge sits behind Instagram's bottom nav and is invisible against a dark video —
  // debug output you cannot see is worthless. Offset for the notch via the safe-area inset.
  const DEBUG_STYLE = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:2147483647',
    'padding:calc(env(safe-area-inset-top, 0px) + 4px) 8px 4px',
    'font:700 11px/1.3 ui-monospace,Menlo,monospace', 'text-align:center',
    'color:#fff', 'background:#c0007a', 'pointer-events:none', 'user-select:none',
  ].join(';');

  // Styled inline rather than from the stylesheet: the kill-switch path returns before the
  // stylesheet is injected, and an unstyled badge dumped into the page flow looks broken.
  // Top-left, not bottom-left: on a phone the bottom corner sits behind Instagram's nav bar,
  // so the one indicator that tells you the filter is alive was invisible where it matters.
  const BADGE_STYLE = [
    'position:fixed', 'left:6px', 'top:calc(env(safe-area-inset-top, 0px) + 4px)',
    'z-index:2147483647',
    'font:600 9px/1 -apple-system,system-ui,sans-serif', 'letter-spacing:.06em',
    'color:#fff', 'background:rgba(0,0,0,.45)', 'padding:3px 5px', 'border-radius:4px',
    'opacity:.5', 'pointer-events:none', 'user-select:none',
  ].join(';');

  function mountBadge(text = 'IF') {
    if (!CONFIG.badge || document.getElementById('if-badge')) return;
    if (!document.body) return;
    const el = document.createElement('div');
    el.id = 'if-badge';
    el.textContent = text;
    el.setAttribute('style', DEBUG ? DEBUG_STYLE : BADGE_STYLE);
    document.body.appendChild(el);
  }

  /**
   * With ?ifdebug=1 the badge reports live state instead of just "IF". There is no console
   * on iOS without tethering to a Mac, so without this every mobile bug costs a round trip.
   *
   *   route   which branch the router picked — "pass" here means the URL was not recognised
   *   sc      scroll containers tagged and clamped
   *   x       queued reels hidden
   *   doc     whether the document itself is clamped
   */
  function updateBadge() {
    if (!DEBUG) return;
    const el = document.getElementById('if-badge');
    if (!el) return;
    const route = document.documentElement.dataset.ifRoute;
    const sc = document.querySelectorAll('.if-reel-scroller').length;
    const extras = document.querySelectorAll('.if-reel-extra').length;
    const docLocked = getComputedStyle(document.body).overflowY === 'hidden';
    // The path is included because the router keying off an unexpected URL shape is the
    // single most likely reason containment silently does nothing.
    const overlay = document.documentElement.dataset.ifOverlay === '1';
    el.textContent =
      `IF v${VERSION} ${route} ov:${overlay ? 'Y' : 'N'} sc:${sc} x:${extras} `
      + `doc:${docLocked ? 'Y' : 'N'} ${location.pathname}`;
  }

  // ------------------------------------------------------------------ init

  applyRoute();

  function start() {
    mountBadge();
    runScrub();
    new MutationObserver(scheduleScrub).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    // Let the SPA settle before taking health baselines.
    setTimeout(() => { health().catch((e) => warn('health check failed', e)); }, 3000);
    log('active —', document.documentElement.dataset.ifRoute, '· ?if=off to disable');
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
