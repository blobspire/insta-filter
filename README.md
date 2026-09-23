# Insta Filter

**Instagram Reels are engineered to be hard to stop watching. This removes them — without
removing Instagram.**

You keep your DMs, your friends' posts and your notifications. You lose the infinite
scroll. A reel someone sends you still plays; it just doesn't lead anywhere.

It runs entirely on your iPhone. No account, no server, no analytics, no remote config —
one readable file that makes zero network requests of its own. Nothing about your Instagram
ever leaves your device.

## What changes

| Before | After |
|---|---|
| Algorithmic feed with ads and suggested posts | Chronological feed of only the accounts you follow |
| Reels tab a thumb-reach away | No Reels tab; `/reels/` redirects home |
| Explore full of discovery bait | Explore is search only — the grid appears once you type |
| A friend's reel drops you into an endless stack | That reel plays; swiping up goes nowhere |
| Messages | Messages, untouched |

## Before you start

**You need an iPhone, and you need Safari.** Safari extensions run only in Safari — Apple
does not expose them to third-party iOS browsers, so this cannot work in Brave, Chrome or
Firefox. They are WebKit shells with no access to installed extensions.

You can keep another browser as your default; see [step 5](#5-optional-open-instagram-automatically).

Also worth knowing up front:

- **iOS 16.4 or later** is ideal. Userscripts itself needs 15.1+, but the stylesheet uses
  the CSS `:has()` selector, which arrived in Safari 16.4. On older versions the Reels icon
  may survive; the rest still works.
- **You browse Instagram in Safari, not the app.** The native app can't be modified. It
  stays installed so notifications keep working.
- **No Xcode, no Apple Developer account, no code signing**, and nothing to reinstall every
  seven days.

## Install

### 1. Install the Userscripts extension

[Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887) from the App Store —
free, [open source](https://github.com/quoid/userscripts), no tracking.

### 2. Give it a folder

Open the app and set its scripts directory to a folder under **On My iPhone** (Files app →
On My iPhone → new folder, e.g. `Userscripts`).

> **Use local storage, not iCloud Drive.** iCloud evicts file *contents* to save space,
> leaving a stub with the right name and size. Userscripts reads a stub as an empty
> directory and reports "No matched userscripts", so the filter silently stops working.
> This will happen to you eventually. Local files are never evicted.

### 3. Add the script

Download [`insta-filter.user.js`](insta-filter.user.js) and put it in that folder. AirDrop
from a Mac is the easiest route — save it to On My iPhone → your folder.

### 4. Turn it on

**Settings → Safari → Extensions → Userscripts** → toggle on, then set **instagram.com** to
**Allow**.

Grant instagram.com specifically rather than "All Websites". Same result here, far smaller
blast radius.

### 5. Optional: open Instagram automatically

So that tapping the Instagram app lands you in the filtered version instead:

**Shortcuts → Automation → + → App → Instagram → Is Opened → Run Immediately**, with one
action: **Open URLs** → `https://www.instagram.com/direct/inbox/`

Land it on the **inbox**, not the feed. The automation can't tell a tapped DM notification
from a deliberate launch, so both arrive at the same page — and from the inbox, the message
you were notified about is at the top, while the feed is one tap away.

If Safari is **not** your default browser, use `x-safari-https://www.instagram.com/direct/inbox/`
instead. That forces Safari and leaves your default alone. (Works on iOS 15, 17 and 18;
reported broken on iOS 16.)

More options — a home-screen icon, and a timed pass for when you genuinely need the native
app — are in [shortcuts/README.md](shortcuts/README.md).

> Fuller walkthrough, including the edit-on-Mac development loop and the iCloud pitfalls:
> [docs/ios-setup.md](docs/ios-setup.md).

### Check it worked

Open `https://www.instagram.com/` in Safari. You should be redirected to `?variant=following`,
see no Reels tab, and see a faint **`IF`** badge in the top-left corner.

**No badge means it isn't running.** Go back to step 4 — iOS resets extension permissions
more often than you'd expect.

## Escape hatches

| URL | Effect |
|---|---|
| `instagram.com/?if=off` | Disable the filter for this Safari session |
| `instagram.com/?if=on` | Re-enable it |
| `instagram.com/?ifdebug=1` | Replace the badge with a live diagnostic bar |

## Tuning

Knobs at the top of `insta-filter.user.js`:

| Option | Default | Effect |
|---|---|---|
| `allowExploreSearch` | `true` | Keeps Explore reachable but strips it to the search box. `false` blocks Explore outright. |
| `unmuteReels` | `true` | Unmutes a reel when it opens, matching the native app. |
| `containReelGestures` | `true` | Swallows upward swipes while a full-screen reel is open. This is what stops one reel becoming twenty. |
| `hardScrollLock` | `false` | Extra clamping for the desktop reel page. Rarely needed. |
| `badge` | `true` | The corner badge. Turn it off once you trust it. |
| `home` | `/?variant=following` | Where "home" goes. |

## How it works

The load-bearing discovery: **`instagram.com/?variant=following` is an undocumented
Instagram route** serving a chronological, following-only feed that is already free of ads
and suggested posts. The filter doesn't rebuild a feed — it redirects to that one.

### Reel containment, and why the obvious designs fail

This part took four rewrites, so the dead ends are worth recording.

**Opening a reel from a DM does not navigate.** The URL stays at `/direct/t/<id>/` while a
full-screen player opens over the thread, and swiping moves through "Suggested" reels
without the path ever changing. Anything keyed to the URL is blind to it — routing,
redirects and route-gated CSS all sat waiting for a navigation that never came.

**Clamping the scroll container doesn't work either.** The desktop reel page has a
`scroll-snap-type: y mandatory` container, so clamping it looked right. On mobile the
player doesn't appear to advance by scrolling at all, so `overflow: hidden`, disabling snap
and scroll listeners all had nothing to act on.

**What works is blocking the gesture.** A capture-phase `touchmove` listener swallows
upward swipes whenever a full-screen reel is open, which holds regardless of how Instagram
implements the transition. Detection is deliberately crude and mechanism-independent: is a
`<video>` covering the viewport? Downward swipes are left alone, so the player can still be
dismissed and you're never trapped.

### Selectors come from measurement, not guesswork

Instagram's class names are obfuscated and rotate constantly, so every rule keys off
something durable — a route `href`, an `aria-label`, exact text, or geometry. Three
findings shaped the code:

- **Posts have no `<header>`**, so ad markers are scoped *geometrically* — a marker sits in
  the post's top chrome, a caption sits below the media. Combined with exact text matching,
  a friend's caption reading "this felt Sponsored" is never mistaken for an ad.
- **Reel permalinks are `/reels/<code>/`** — plural, sharing a prefix with the infinite
  feed at `/reels/`. Getting this wrong meant a reel a friend sent was redirected away
  instead of played.
- **A vertical scroll-snap container** distinguishes a reel stack from a DM conversation
  list, which otherwise look identical.

## Why a userscript, and not something more native

Filtering a page requires reading and modifying that page. Nothing can hide Reels without
access to Instagram's DOM, so the question is never "avoid page access" — it's "who holds
it".

| Approach | Does the job? | Trust surface |
|---|---|---|
| **Userscripts** (chosen) | Everything | One open-source third-party extension, scoped to instagram.com only |
| Your own Safari Web Extension | Everything | No third party — but needs Xcode, and free Apple signing expires every 7 days |
| Content blocker | **No** | Strongest — declarative rules that cannot read the page at all |
| Screen Time / DNS filtering | No | None, but cannot filter *within* a site |

**The safest option can't do the job.** A content blocker is declarative — CSS hiding and
URL blocking, no JavaScript. That rules out the `?variant=following` redirect, text-based
ad scrubbing, and, fatally, reel containment. It could block `/reels/` wholesale, but that
also blocks the reel a friend sent, since both share the `/reels/<code>/` shape.

**Residual risk, stated plainly:** you're trusting that the Userscripts App Store binary
matches its published source. That risk is bounded by granting it instagram.com only. The
filter itself makes no network requests and has no remote config.

**Migration is cheap.** `insta-filter.user.js` is an ordinary content script; moving to a
self-signed Safari Web Extension later is a packaging change, not a rewrite.

## Known limits

- **`?variant=following` is undocumented** and Instagram could remove it. The
  Sponsored/Suggested scrubber is the fallback — it cleans the algorithmic feed, just less
  perfectly.
- **Mobile web DMs lack some features** — disappearing media, some voice and call
  features. The native app is still there for those; see the timed pass in
  [shortcuts/README.md](shortcuts/README.md).
- **The bounce automation can't tell why the app opened.** A notification tap lands on the
  same page as a deliberate launch, which is why it should land on the inbox. The native
  app also marks the message read before Safari takes over — a race Shortcuts can't win.
  See [shortcuts/README.md](shortcuts/README.md#why-the-automation-lands-on-the-inbox-not-the-feed).
- **Selectors break.** Instagram ships DOM changes regularly. Expect occasional
  maintenance; the tooling below is built to make it cheap.
- **iOS sometimes resets extension permissions** after an update. The badge tells you.

## When it breaks

`instagram.com/?ifdebug=1` replaces the badge with a live diagnostic bar:

```
IF v0.5.0 dm ov:Y sc:1 x:0 doc:N /direct/t/<id>/
```

Version loaded, route, whether a reel overlay was detected, containers clamped, elements
hidden, and the path the router saw. There's no console on iOS without tethering to a Mac,
so this is the primary diagnostic.

The script also remembers the highest match count each rule has ever produced and warns
when a rule that used to match something now matches nothing — naming the selector that
died rather than leaving you to hunt.

[docs/debugging.md](docs/debugging.md) covers attaching Safari Web Inspector to the phone
and fixing a stale selector, and `tools/audit.js` is a read-only console script that
reports which selectors still match live Instagram. Its output is shape-only — no
usernames, IDs or post content — so it's safe to paste into an issue.

## Development

```sh
npm test          # everything
npm run test:unit # pure logic, no browser
npm run test:dom  # fixtures in headless Chrome
```

Zero dependencies — the filter has none, and neither does the test harness.

**4 unit tests** cover route classification, the reel-permalink parser, and stylesheet
brace balance (one unbalanced brace would silently disable every rule after it).

**55 DOM checks** run the real script against five fixtures in headless Chrome, each
modelled on measured Instagram behaviour:

| Fixture | Guards against |
|---|---|
| `fixture.html` | Ads hidden, but a caption saying "Sponsored" is not; a portrait video post is not mistaken for a reel |
| `reel-fixture.html` | Reel page clamped, comments still scrollable |
| `reel-ambiguous.html` | Refusing to clamp when the right container is ambiguous |
| `dm-reel-overlay.html` | A reel overlay on a DM route — the case that broke four designs |
| `explore-fixture.html` | Explore stripped to search, and restored the moment you type |

`test:dom` skips cleanly without a Chromium-family browser. You can also open any fixture
in a browser and read the PASS/FAIL list.

Pull requests welcome, particularly selector fixes when Instagram moves things. If you're
reporting a breakage, `?ifdebug=1` output and an `audit.js` dump are the two most useful
things to include.

## Licence

MIT — see [LICENSE](LICENSE). Use it, fork it, fix the selectors when Instagram moves them.
