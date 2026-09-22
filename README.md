# Insta Filter

Removes Reels, Explore and the algorithmic feed from Instagram on an iPhone — without
uninstalling the app, and without handing your account to a third party.

**Everything runs on your device.** The script makes no network requests of its own, has no
analytics and no remote config. It's one readable file you can audit in ten minutes.

## What you get

| Before | After |
|---|---|
| Algorithmic feed with ads and suggested posts | Chronological feed of only the accounts you follow |
| Reels tab one thumb-reach away | No Reels tab; `/reels/` redirects home |
| Explore tab | No Explore tab; `/explore/` redirects home |
| A reel from a friend drops you into an infinite scroller | That reel plays; swiping up does **not** advance to the next one |
| DMs | DMs, untouched |

## How it works

Three independent layers. If one breaks, the others still work and you're never locked out
of Instagram.

```
┌─ Layer 3 ─ Home screen ────────────────────────────────┐
│  Shortcut "Instagram" → opens Safari at                │
│  https://www.instagram.com/?variant=following          │
└───────────────────────┬────────────────────────────────┘
                        ▼
┌─ Layer 1 ─ The filter (Userscripts extension, Safari) ─┐
│  insta-filter.user.js @ document-start                 │
│   · route gate   · CSS hide rules   · reel containment │
└────────────────────────────────────────────────────────┘

┌─ Layer 2 ─ Native app containment (Shortcuts) ─────────┐
│  "Instagram Is Opened" automation → bounce to Layer 3  │
│  unless the 5-minute pass file is fresh                │
└────────────────────────────────────────────────────────┘
```

The single most useful discovery: **`instagram.com/?variant=following` is an undocumented
Instagram route** that serves a chronological, following-only feed already free of ads and
suggested posts. We don't rebuild a feed — we redirect to that one.

## Install

See **[docs/ios-setup.md](docs/ios-setup.md)** for the full walkthrough. Short version:

1. Install [Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) (free, open
   source, no tracking) from the App Store.
2. Point it at an iCloud Drive folder and copy `insta-filter.user.js` there.
3. Settings → Safari → Extensions → Userscripts → enable, set instagram.com to **Allow**.
4. Build the Shortcuts in **[shortcuts/README.md](shortcuts/README.md)**.

No Xcode, no Apple Developer account, no code signing, nothing to re-install every 7 days.

## How reel containment actually works

Worth recording, because the obvious design is wrong and cost four rewrites to disprove.

**Opening a reel from a DM does not navigate.** The URL stays at `/direct/t/<id>/` while a
full-screen player opens over the thread, and swiping moves through "Suggested" reels —
the algorithmic stack — without the path ever changing. Anything keyed to the URL is blind
to it. Routing, redirects and route-gated CSS all sat waiting for a navigation that never
came.

**Clamping the scroll container does not work either.** The desktop reel page has a
`scroll-snap-type: y mandatory` container, so clamping it looked right. On mobile the
player does not appear to advance by scrolling at all, so `overflow: hidden`,
`scroll-snap-type: none` and scroll listeners all had nothing to act on.

**What works is blocking the gesture.** A capture-phase `touchmove` listener swallows
upward swipes whenever a full-screen reel is open, which holds regardless of how Instagram
implements the transition. Detection is deliberately crude and mechanism-independent: is a
`<video>` filling the viewport? A reel is full-bleed; a feed video post is roughly square
and far shorter than the threshold on a phone.

Downward swipes are left alone, so the player can still be dismissed and you are never
trapped in it. The earlier scroll-container clamp is kept as belt and braces for the
desktop reel page, where it does apply.

## Why Userscripts, and not something more native

Filtering a page requires reading and modifying that page. Nothing can hide Reels without
access to Instagram's DOM, so the question is never "avoid page access" — it is "who holds
it". The options, honestly compared:

| Approach | Does the job? | Trust surface |
|---|---|---|
| **Userscripts** (chosen) | Everything | One open-source third-party extension, scoped to instagram.com only |
| Our own Safari Web Extension | Everything | No third party — but needs Xcode, and free Apple signing expires every 7 days |
| Content blocker | **No** | Strongest — declarative rules that cannot read the page at all |
| Screen Time / DNS filtering | No | None, but cannot filter *within* a site |

**The safest option cannot do the job.** A content blocker is declarative: CSS hiding and
URL blocking, no JavaScript. That rules out the `?variant=following` redirect, text-based
ad scrubbing (CSS cannot match "Sponsored"), and — fatally — reel containment, which needs
a scroll container clamped at runtime. It could block `/reels/` wholesale, but that also
blocks the reel a friend sent, since both share the `/reels/<code>/` shape. The result
would be "no reels at all", which is not what this project is for.

**Residual risk, stated plainly:** you are trusting that the Userscripts App Store binary
matches its published source, and that future updates stay honest. That risk is bounded by
granting it **instagram.com only** — never "All Websites". The filter itself makes no
network requests, has no remote config, and is one readable file.

**Migration is cheap.** `insta-filter.user.js` is an ordinary content script. Moving to a
self-signed Safari Web Extension later is a packaging change, not a rewrite.

## Escape hatches

| URL | Effect |
|---|---|
| `instagram.com/?if=off` | Disable the filter for this Safari session |
| `instagram.com/?if=on` | Re-enable it |
| `instagram.com/?ifdebug=1` | Log a table of every rule and its live match count |

A small `IF` badge in the bottom-left corner means the script is running. No badge means it
isn't — check Settings → Safari → Extensions first.

## Tuning

Two knobs at the top of `insta-filter.user.js`:

- `hardScrollLock` — set to `true` if you can still swipe to the next reel. Blocks the
  vertical pan gesture outright, at the cost of scrolling inside the reel view.
- `badge` — set to `false` once you trust it.

## Maintenance

Instagram changes its DOM regularly, so selectors will break every few months. The health
check exists to make that cheap: it remembers the highest match count each rule has ever
seen and warns you when a rule that used to match something now matches nothing — so you
learn *which* selector died, not just that "it stopped working".

See **[docs/debugging.md](docs/debugging.md)** for how to attach Safari Web Inspector to the
phone and fix a stale selector in about ten minutes.

## Tests

```sh
npm test          # both suites
npm run test:unit # pure logic, no browser needed
npm run test:dom  # runs the fixture in headless Chrome
```

Zero dependencies — the filter has none, and neither does the test harness.

- **Unit** (`test/route.test.mjs`) — route classification, the reel-permalink parser, and
  stylesheet brace balance. That last one matters: a single unbalanced brace would silently
  disable every hide rule after it.
- **DOM** (`test/fixture.html` + `test/dom.mjs`) — a fake Instagram page the script actually
  runs against, checking that the right things get hidden *and the wrong things don't*. The
  assertion that earns its keep: a friend's caption containing the word "Sponsored" must not
  get the post scrubbed.

`test:dom` skips cleanly if no Chromium-family browser is installed. You can also just open
`test/fixture.html` in any browser and read the PASS/FAIL list.

## Requires Safari

Safari extensions run only in Safari. Apple does not expose them to third-party iOS
browsers, so this cannot work in Brave, Chrome or Firefox — they are WebKit shells with no
access to installed extensions.

If Safari is not your default browser you can still use this: point the Shortcuts
automation at `x-safari-https://...` instead of `https://...`, which forces Safari while
leaving your default alone. See [shortcuts/README.md](shortcuts/README.md).

## Known limits

- **`?variant=following` is undocumented** and Instagram could remove it. The Sponsored /
  Suggested scrubber is the fallback — it cleans the algorithmic feed, just less perfectly.
- **Mobile web DMs lack some features** (disappearing media, some voice and call features).
  The 5-minute pass shortcut is the escape hatch to the real app.
- **The bounce automation also fires on notification taps.** The pass file softens it.
- **iOS sometimes resets extension permissions** after an update. The badge tells you.
