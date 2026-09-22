/*
 * Insta Filter — selector audit
 *
 * Paste this into the browser console on a REAL, logged-in instagram.com page.
 * It is strictly read-only: it reads the DOM, changes nothing, hides nothing, and makes
 * no network requests. Its whole job is to answer "do the filter's selectors match the
 * Instagram that actually shipped?" before you go through the iOS setup.
 *
 * Run it on three pages and keep each summary:
 *   1. https://www.instagram.com/?variant=following   (the feed)
 *   2. a reel permalink, e.g. /reel/<code>/           (the containment target)
 *   3. https://www.instagram.com/direct/inbox/        (must be left alone)
 */

(() => {
  const count = (sel) => { try { return document.querySelectorAll(sel).length; } catch (e) { return `ERR: ${e.message}`; } };

  const hasSupport = (() => { try { document.querySelector('a:has(svg)'); return true; } catch { return false; } })();

  // Does this exact string exist as a standalone text node anywhere on the page?
  const exactText = (needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node, n = 0;
    while ((node = walker.nextNode())) {
      if (node.textContent.trim() === needle && ++n > 0) return n;
    }
    return 0;
  };

  const selectors = {
    'nav.reels.href':      'a[href="/reels/"]',
    'nav.reels.aria':      hasSupport ? 'a:has(svg[aria-label="Reels"])' : 'svg[aria-label="Reels"]',
    'nav.explore.href':    'a[href="/explore/"]',
    'nav.explore.aria':    hasSupport ? 'a:has(svg[aria-label="Explore"])' : 'svg[aria-label="Explore"]',
    'feed.article':        'article',
    'feed.article.header': 'article header',
    'reel.next.aria':      '[aria-label="Next"]',
    'reel.prev.aria':      '[aria-label="Previous"]',
    'main':                'main',
  };

  const matches = {};
  for (const [name, sel] of Object.entries(selectors)) matches[name] = count(sel);

  const labels = {};
  for (const t of ['Sponsored', 'Suggested for you', 'Suggested post', 'Suggested posts',
                   'Open the app', 'Open app', 'Use the app']) {
    labels[t] = exactText(t);
  }

  // Replicates tagReelScroller()'s heuristic so we can see whether it finds anything here.
  let scrollers = 0;
  const scrollerInfo = [];
  const main = document.querySelector('main');
  if (main) {
    for (const el of main.querySelectorAll('div, section')) {
      const cs = getComputedStyle(el);
      const scrolls = /(auto|scroll)/.test(cs.overflowY);
      const snaps = cs.scrollSnapType && cs.scrollSnapType !== 'none';
      if ((snaps || scrolls) && el.scrollHeight > el.clientHeight + 40) {
        scrollers++;
        if (scrollerInfo.length < 3) {
          // The filter hides the scroller's children after the first, but only when there
          // are at least three of them. Report the real shape so that guard can be checked
          // rather than assumed.
          scrollerInfo.push({
            tag: el.tagName, snap: cs.scrollSnapType, overflowY: cs.overflowY,
            scrollH: el.scrollHeight, clientH: el.clientHeight,
            childCount: el.children.length,
            childShape: [...el.children].slice(0, 4).map((c) =>
              `${c.tagName.toLowerCase()}(h=${Math.round(c.getBoundingClientRect().height)})`),
          });
        }
      }
    }
  }

  // --- structure probe -----------------------------------------------------------------
  // Instagram's posts turned out to have no <header>, so the filter cannot scope its ad
  // search that way. These two sections report where the ad labels actually live, so the
  // scoping rule can be derived from the real DOM instead of guessed at.

  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    const role = el.getAttribute && el.getAttribute('role');
    if (role) s += `[role=${role}]`;
    return s;
  };

  const chainToArticle = (el) => {
    const parts = [];
    let node = el, depth = 0;
    while (node && node.tagName !== 'ARTICLE' && depth++ < 12) {
      parts.push(describe(node));
      node = node.parentElement;
    }
    return parts.join('<') + (node && node.tagName === 'ARTICLE' ? '<ARTICLE' : '<(none)');
  };

  const articles = [];
  document.querySelectorAll('article').forEach((a, i) => {
    if (i >= 3) return;
    const rect = a.getBoundingClientRect();
    articles.push({
      i,
      h: Math.round(rect.height),
      hasHeader: !!a.querySelector('header'),
      kids: [...a.children].slice(0, 4).map((c) =>
        `${describe(c)}(h=${Math.round(c.getBoundingClientRect().height)})`),
      links: [...a.querySelectorAll('a[href^="/"]')].slice(0, 3).map((l) => l.getAttribute('href')),
    });
  });

  // For every ad label on the page: is it inside an article, and how far down?
  const placement = [];
  {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = node.textContent.trim();
      if (!['Sponsored', 'Suggested for you', 'Suggested post', 'Suggested posts'].includes(t)) continue;
      const el = node.parentElement;
      if (!el) continue;
      const art = el.closest('article');
      const r = el.getBoundingClientRect();
      placement.push({
        text: t,
        inArticle: !!art,
        dyFromArticleTop: art ? Math.round(r.top - art.getBoundingClientRect().top) : null,
        articleH: art ? Math.round(art.getBoundingClientRect().height) : null,
        chain: chainToArticle(el),
      });
      if (placement.length >= 6) break;
    }
  }

  const summary = {
    url: location.pathname + location.search,
    lang: document.documentElement.lang || '(none)',
    hasSelectorSupported: hasSupport,
    variantFollowingStuck: new URLSearchParams(location.search).get('variant') === 'following',
    matches,
    labels,
    reelScrollers: scrollers,
    scrollerInfo,
    articles,
    placement,
  };

  console.log('%c Insta Filter — selector audit ', 'background:#222;color:#fff;padding:2px 6px');
  console.log('page:', summary.url, '· lang:', summary.lang, '· :has() supported:', hasSupport);
  console.table(matches);
  console.table(labels);
  if (main) console.log('reel scroller candidates:', scrollers, scrollerInfo);
  else console.warn('no <main> found — the page may still be loading');

  console.log('%c Copy the line below and send it back: ', 'background:#060;color:#fff;padding:2px 6px');
  console.log(JSON.stringify(summary));

  try {
    if (typeof copy === 'function') { copy(JSON.stringify(summary)); console.log('(copied to clipboard)'); }
  } catch { /* copy() only exists in devtools */ }

  return summary;
})();
