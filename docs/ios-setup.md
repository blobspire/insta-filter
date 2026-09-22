# iOS setup

One-time, about 15 minutes. No Xcode, no developer account, no code signing.

## Requirements

- iOS 16.4 or later. (Userscripts needs 15.1+; the stylesheet uses the CSS `:has()`
  selector, which Safari got in 16.4. On 15.x the Reels/Explore icons may survive — the
  `href`-based rules still work, so it degrades rather than breaks.)
- An iCloud Drive account, to sync the script from your Mac to your phone.

---

## 1. Install the Userscripts extension

Install **[Userscripts](https://apps.apple.com/us/app/userscripts/id1463298887)** from the
App Store. It's free and [open source](https://github.com/quoid/userscripts) with no
tracking — which is the whole point, given the commercial alternatives want your account.

## 2. Give it a folder — use local storage, not iCloud

Open the Userscripts app and set its scripts directory to a folder under **On My iPhone**,
not iCloud Drive.

**This is learned the hard way.** iCloud Drive looks like the obvious choice — edit on the
Mac, appears on the phone — but iCloud evicts file *contents* to reclaim space, leaving a
stub with the right name and size. Userscripts reads a stub as an empty directory and
reports "No matched userscripts", so the filter silently stops working and Instagram goes
back to normal.

Worse, **replacing the file from the Mac re-triggers it**: the phone receives a new version
that arrives as a placeholder until something opens it. So the update workflow itself keeps
breaking the thing. "Keep Downloaded" pins what is there now; it does not reliably survive
the file being replaced.

Local files are never evicted. The cost is that updates arrive by AirDrop instead of
automatically — an easy trade for something you depend on daily, especially once the script
has stopped changing much.

**Setup:** Files app → On My iPhone → new folder `Userscripts` → put the script in it →
point the Userscripts app at that folder.

**To update later:** AirDrop the new `insta-filter.user.js` from the Mac, Save to Files →
On My iPhone → Userscripts, overwrite, then open the Safari popup once to re-scan.

## 3. Copy the script in

From this repo on your Mac:

```sh
cp insta-filter.user.js ~/Library/Mobile\ Documents/com~apple~CloudDocs/Userscripts/
```

Or symlink it, so edits here sync straight to the phone with no copy step:

```sh
ln -sf "$PWD/insta-filter.user.js" \
  ~/Library/Mobile\ Documents/com~apple~CloudDocs/Userscripts/insta-filter.user.js
```

> Symlinks and iCloud can be temperamental — iCloud may sync the link rather than the
> contents. If the phone doesn't see the script, fall back to `cp`.

## 4. Download the files ON THE PHONE (iCloud only)

*Skip this if you followed step 2 and used local storage — it is the problem local storage
avoids.*

This is the step that bites. iCloud will happily show the file in the Files app and in the
Userscripts directory picker — correct name, correct size — while the actual bytes are not
on the device. The giveaway is a small **cloud-with-down-arrow badge** next to the filename.
Userscripts cannot read a placeholder, and reports **"No valid files found in directory"**,
which reads like the folder is empty or the script is malformed. It is neither.

1. Files app → Browse → iCloud Drive → Userscripts
2. **Tap each file once** to download it — the cloud badge disappears
3. **Long-press the Userscripts folder → Keep Downloaded**, so iOS cannot evict them again

Skipping step 3 gives you a filter that works today and silently stops in a few weeks.

## 5. Enable it in Safari

On the iPhone: **Settings → Safari → Extensions → Userscripts**

- Toggle it **on**
- Tap **instagram.com** and set it to **Allow**
- Setting "All Websites" to Allow also works, but per-site is the smaller blast radius

## 6. Check it's alive

Open `https://www.instagram.com/` in Safari. You should:

- get redirected to `?variant=following`
- see a chronological feed of only the accounts you follow
- see **no Reels tab** in the bottom navigation
- see a faint `IF` badge in the bottom-left corner

No badge means the script isn't running. Go back to step 5 — iOS resets extension
permissions more often than you'd expect.

## 7. Build the Shortcuts

Follow **[../shortcuts/README.md](../shortcuts/README.md)** for the home screen icon, the
auto-bounce automation and the 5-minute pass.

---

## The development loop

**For editing the script:** edit on the Mac → wait for iCloud → open the Userscripts popup
in iOS Safari (this is what makes it re-read the folder) → reload Instagram.

**For working out selectors:** iCloud sync is too slow to iterate against. Attach Safari Web
Inspector to the phone instead and try selectors live in the console — see
[debugging.md](debugging.md).

**For fast iteration generally:** install the macOS version of Userscripts too. It has a
built-in editor, and you can test everything but the reel *swipe* gesture in a narrow Safari
window on the Mac.
