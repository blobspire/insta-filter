# Shortcuts

Three things to build in the Shortcuts app. They can't be committed as files — `.shortcut`
files are signed per-device — so they're written out as action lists.

Build them in this order.

---

## 1. "Instagram" — the home screen icon

This replaces the real Instagram icon on your home screen.

**Shortcuts → + → Add Action → `Open URLs`**

| Field | Value |
|---|---|
| URL | `https://www.instagram.com/?variant=following` |

Name it **Instagram**. Then from the shortcut's share sheet: **Add to Home Screen**, and pick
a photo for the icon (a screenshot of the real Instagram glyph works).

Move the real Instagram app off your first home screen — into the App Library or a folder on
the last page. The whole point is that the filtered version is the one within thumb's reach.

> **It must be a Shortcut, not a Safari bookmark.** "Add to Home Screen" from Safari creates a
> standalone web app that runs *outside* Safari, where the Userscripts extension is
> [unreliable](https://developer.apple.com/forums/thread/718789). A Shortcut's `Open URLs`
> hands off to Safari proper, where the extension works.
>
> The tradeoff: a brief flash of the Shortcuts app on launch. Unavoidable, and you stop
> noticing it.

> **If Safari is not your default browser, read this.** `Open URLs` hands the URL to the
> *default* browser, and Safari extensions only run in Safari — Apple does not expose them
> to Brave, Chrome, Firefox or anything else, and that is not changing. Landing in another
> browser means unfiltered Instagram with no indication why.
>
> You do not have to change your default. iOS has an undocumented scheme that forces Safari:
>
> ```
> x-safari-https://www.instagram.com/?variant=following
> ```
>
> Use that as the `Open URLs` value and your default browser is left alone. Reported working
> on iOS 15, 17 and 18, and reported broken on iOS 16 — if you are on 16, you will have to
> switch your default to Safari instead (Settings → Apps → Safari → Default Browser App).

> **A leak worth knowing about.** The automation covers opening the Instagram app. It does
> not cover tapping an Instagram link from another app, which still goes to your default
> browser — unfiltered. If that happens often, making Safari the default closes the gap.

---

## 2. "IG pass 5 min" — the escape hatch

Web DMs can't do everything (disappearing media, voice notes, calls). This gives you five
uninterrupted minutes in the real app, and is what stops the auto-bounce in step 3 from
being infuriating when you tap a DM notification.

**Shortcuts → + →** add these actions in order:

| # | Action | Configuration |
|---|---|---|
| 1 | `Date` | Leave as **Current Date** |
| 2 | `Format Date` | Format: **ISO 8601**, Include Time: **on** |
| 3 | `Save File` | Destination: **iCloud Drive**, path `insta-filter/pass.txt`, **Ask Where to Save: off**, **Overwrite If File Exists: on** |
| 4 | `Open App` | **Instagram** |

Name it **IG pass 5 min** and add it to your home screen next to the filtered icon.

Run it once now, so `pass.txt` exists before you build the automation.

---

## 3. The auto-bounce automation

**Shortcuts → Automation tab → + → App**

- App: **Instagram**
- Trigger: **Is Opened**
- **Run Immediately** (on iOS 16 this is the "Ask Before Running" toggle — turn it **off**)

Then add these actions:

| # | Action | Configuration |
|---|---|---|
| 1 | `Get File` | iCloud Drive, path `insta-filter/pass.txt`, **Error If Not Found: off** |
| 2 | `If` | `Get File` **has any value** |
| 3 | &nbsp;&nbsp;`Get Text from Input` | input: the file from step 1 |
| 4 | &nbsp;&nbsp;`Get Dates from Input` | input: the text from step 3 |
| 5 | &nbsp;&nbsp;`Get Time Between Dates` | From: the date from step 4 · To: **Current Date** · Units: **Minutes** |
| 6 | &nbsp;&nbsp;`If` | `Time Between Dates` **is less than** `5` |
| 7 | &nbsp;&nbsp;&nbsp;&nbsp;`Stop This Shortcut` | — you're inside the pass window, stay in the app |
| 8 | &nbsp;&nbsp;`Otherwise` | |
| 9 | &nbsp;&nbsp;&nbsp;&nbsp;`Open URLs` | `https://www.instagram.com/?variant=following` |
| 10 | `Otherwise` | (outer If — no pass file at all) |
| 11 | &nbsp;&nbsp;`Open URLs` | `https://www.instagram.com/?variant=following` |

The nesting matters: steps 3–9 sit inside the outer `If`, and 7 sits inside the inner one.

**Behaviour:**

- Open Instagram normally → bounced to the filtered web feed.
- Tap **IG pass 5 min** → the app opens and stays open for five minutes.
- Tap a DM notification within that window → stays in the app.
- Tap a DM notification outside it → bounced. Tap the pass shortcut and go back in.

**Failure mode is deliberately safe:** if the file is missing or the date won't parse, the
automation bounces. The filter fails *closed*.

---

## Simpler version

If the pass file feels like too much machinery, the automation can be a single action:

**App → Instagram → Is Opened → Run Immediately → `Open URLs`
`https://www.instagram.com/?variant=following`**

You lose the escape hatch, so every notification tap throws you to the web. Try it for a few
days — if the notification bouncing annoys you, come back and add the pass.

---

## Optional backstop: Screen Time

Settings → Screen Time → App Limits → Instagram → 5 minutes/day.

Redundant with the bounce, but it catches the case where you disable the automation in a
weak moment. Set the Screen Time passcode to something you don't have memorised.
