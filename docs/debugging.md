# Debugging

Instagram ships DOM changes regularly. Expect to spend ten minutes on this every few months.

## Is it even running?

Look for the faint `IF` badge in the bottom-left corner.

| Symptom | Cause |
|---|---|
| No badge at all | Extension disabled or lost permission. Settings → Safari → Extensions → Userscripts → instagram.com → Allow |
| Badge says `IF off` | The `?if=off` kill switch is sticky for the session. Visit `instagram.com/?if=on` |
| Badge present, but Reels tab is back | A selector went stale. Read on. |

## "No valid files found in directory"

The popup says this when the scripts directory contains only **iCloud placeholders** — the
filenames and sizes have synced but the contents have not. It looks identical to an empty
or malformed-script directory, which makes it needlessly confusing.

Check the Files app: a cloud-with-down-arrow badge next to the filename means the bytes are
not on the device. Tap each file to download, then long-press the folder and choose **Keep
Downloaded**. Reopen the Safari popup afterwards — that is what triggers the re-scan.

If the files *are* downloaded and it still says this, the metadata block is not parsing.
Bisect it with a four-line script carrying only `@name` and `@match`; if that one loads,
the problem is in the real script's metadata, not the directory.

## Which rule broke?

Open `https://www.instagram.com/?ifdebug=1` and check the console. You get a table of every
rule and how many nodes it currently matches:

```
┌────────────────┬────────┐
│ (index)        │ Values │
├────────────────┼────────┤
│ nav.reels      │ 1      │
│ nav.explore    │ 1      │
│ feed.articles  │ 12     │
│ feed.hidden    │ 0      │
│ reel.scroller  │ 0      │
└────────────────┴────────┘
```

The script also remembers the highest count each rule has ever produced. When a rule that
used to match something now matches nothing, it logs:

```
[insta-filter] rule "nav.reels" matched 1 nodes before and 0 now —
Instagram probably changed its DOM.
```

That names the broken selector directly.

> `reel.scroller` is expected to be `0` unless you are on a reel permalink.
> `feed.hidden` is expected to be `0` on the following feed — there is nothing to scrub there.

## Reading the debug bar on the phone

`?ifdebug=1` replaces the corner badge with a magenta bar across the top of the page. There
is no console on iOS without tethering to a Mac, so this is the primary mobile diagnostic:

```
IF v0.4.0 dm ov:Y sc:1 x:0 doc:N /direct/t/000000000000000/
```

| Field | Meaning |
|---|---|
| `v0.4.0` | Version actually loaded. **Check this first** — the phone often holds a stale copy, and "nothing changed" looks identical to "did not load" |
| `dm` | Route the router picked. `pass` means the URL was not recognised |
| `ov:Y` | A full-screen reel is open and the gesture blocker is armed |
| `sc:1` | Scroll containers clamped |
| `x:0` | Queued reels hidden |
| `doc:N` | Whether the document itself is clamped |
| path | What the router actually saw |

`ov` is usually the interesting one for reel problems. `ov:N` inside a reel means detection
failed; `ov:Y` while still able to swipe up means the gesture is being handled somewhere the
listener cannot preempt.

## Attaching Safari Web Inspector to the phone

This is the only sane way to work out new selectors.

1. **iPhone:** Settings → Safari → Advanced → **Web Inspector** on
2. **Mac:** Safari → Settings → Advanced → **Show Develop menu**
3. Connect the phone by USB and trust the Mac
4. Open Instagram on the phone
5. **Mac Safari → Develop → _your iPhone_ → the Instagram tab**

You now have a full console and element inspector attached to the live page on the phone.

## Fixing a stale selector

Instagram's class names are obfuscated and rotate on every deploy, so **never** select by
class. In rough order of durability:

1. **Route `href`** — `a[href="/reels/"]`. Routes are product surface; they almost never change.
2. **`aria-label`** — `svg[aria-label="Reels"]`. Stable because accessibility tooling depends
   on it, but it is localised, so it breaks if you change your Instagram language.
3. **Exact text content** — `Sponsored`. Also localised.
4. **Structure** — "a scrollable box inside `<main>`". Last resort; used only for the reel
   scroller, which has no stable handle.

Try the replacement in the attached console first:

```js
document.querySelectorAll('a[href="/reels/"]').length
```

Then put it in `insta-filter.user.js`, add it to the `RULES` array so the health check covers
it, and add a case to `test/route.test.mjs` if it's routing logic.

## The reel lock didn't hold

If you can still swipe to the next reel:

1. Set `hardScrollLock: true` in `CONFIG` at the top of the script. This adds
   `touch-action: pan-x` to the scroller, which blocks the vertical swipe outright.
2. If it still advances, check whether `reel.scroller` is `0` in the debug table — that means
   `tagReelScroller()` failed to find the scrolling element. Inspect the reel view and find
   what actually scrolls, then adjust the heuristic.

The URL lock is the backstop: even if the swipe works, the script reverts the URL, and
escalates to a hard reload of the original reel if the soft revert doesn't stick. You'll
notice this as the page snapping back.

## Blank page

The redirect guard should prevent this, but if you get a white screen: `instagram.com/?if=off`
disables the filter for the session so you can see what's happening.

If Instagram ever stops honouring `?variant=following`, the guard trips after 3 redirects in
10 seconds, logs a warning, and lets the page render normally. You'd then be on the
algorithmic feed with only the scrubber protecting you — the sign that this project needs a
new approach to the home feed.
