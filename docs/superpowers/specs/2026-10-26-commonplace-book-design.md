# Commonplace book

Drafted 2026-10-26; revised 2026-11-05 to Nhat's answers (his live desk, 11-04 §1: "good; all yours"). Agreed. Nothing is built yet.

## Goal

A place for Nhat's own raw notes, lessons, journals and readings, not tied to any book, to find again by month, by topic or by search. The way in is a plain text paste or typing; the iPhone share sheet comes second. Text only: no pictures.

## Shape

Three shapes were compared on 10-26: entries as their own record kind, entries as blocks of one special book, and entries stored as highlights in a hidden host book. A special book rewrites every chunk on each save and shifts every highlight when an entry is inserted; a host book's state holds about a thousand text entries before its 1 MiB fills, and a capture on one device is lost on another's next save. Entries inside the `words` collection (as fact cards are) would need about eight exceptions in the word code: the Study queue, the Words tab's chips and search, dictionary lookups (`needs`, `enrich`), To sort, the restore guard, `restoreWord` and the Trash row.

So: one new record kind, `entry:<id>`, one Firestore document per entry, listed like words; shown in a third Notebook tab named **Commonplace**. It follows the words pattern nearly line for line and changes nothing in books, highlights or words.

## Each new piece, and the case against it

| New piece | What could do the job already | Why it's still worth it, or what it reuses |
|---|---|---|
| `entries` collection (`entry:<id>`) | `words`, as fact cards do | Keeps the word code free of entry checks (above) |
| Commonplace tab | A chip in the Words tab | Entries have no meaning, dictionary or Study. Reuses the Notebook's tabs, list, chips and stats line |
| Entry sheet | The note box | It is the note box: `asSheet()`, the same save rules, plus a date row. Not a new kind of dialog |
| Month headings | The Notebook's colour group headings | Same markup and styles, grouped by month |
| Topic chips | The Notebook's chips row (`.nb-chips`) | Same component; topics come from hashtags in the text, never stored |
| `tagsOf()`, `pastedDate()` in parse.js | `isDateLine()`, `parseDate()`, `nbFold()` | Small pure helpers on top of those, tested in Node |
| One Notebook search box (second step) | The Highlights and Words boxes | Replaces both; the matching code exists |
| `?entry=` deep link (third step) | `?text=`, which adds a book | A snippet isn't a book. One more name in `readDeepLink` |
| A new module or file | None needed | Only a new browser test file, `tests/browser/commonplace.mjs` |

## Data model

```
entry:<id>  →  users/{uid}/entries/{id}
  { id, text, date, added, up }
```

- `id`: `e` + time + random, like Trash ids.
- `text`: Markdown as typed or pasted, line breaks kept. No separate title or source field: the first line is the entry's title wherever one is needed (the Trash row, a toast), and a link in the text is clickable.
- `date`: the entry's own date, `YYYY-MM-DD` in local time. Today by default, editable, so an old journal entry lands in its own month.
- `added`: when it was made (ms), the tiebreak within a day. `up`: the last save (ms), so restore keeps the newer copy and "read only what changed" can come later without a migration.
- Topics are derived from `text` each time, never stored, so they can't drift from the text.
- An entry over 800 KB, well inside Firestore's 1 MiB a document, isn't saved: "Too long for one entry. Add it to the shelf as a book instead."

store.js gains `entry: 'entries'` in `COLL` and `LISTED`. The local adapter, the Firestore rules (`users/{uid}/{document=**}`) and the service worker need nothing.

## The Commonplace tab

- Top: **New entry** and **Paste**, then the tab's search box and the topic chips. The hero's stats line reads "12 entries · 5 topics".
- The list: month headings, newest first ("November 2026 · 4"), and under each the entries by `date`, then `added`, newest first. Each card shows its day ("Nov 5"), then its text rendered as Markdown (`mdToBlocks`, then the reader's `blockHTML`: headings, `**bold**`, `*italic*`, lists, quotes, links, code). Image lines are skipped. A long card is clipped at about eight lines with **Show more**.
- `#tags` in a card's text look like links; a tap filters by that topic, as its chip does.
- A tap elsewhere on a card opens it in the entry sheet.
- The list draws its first 100 cards, then **Show more** at the bottom, so a few thousand entries don't stall a phone.
- Empty tab: "Your own notes, lessons and journals. Paste or type one; #tags make topics."

## Topics

- A hashtag is `#` followed by a letter, then letters, digits, `-` or `_` (Unicode letters, so accented words work), not preceded by a letter, digit, `/` or `&`. So `#stoicism`, `#lesson`, `#đọc-sách` count; a Markdown heading (`# Title`), a link's `#fragment` and `&#39;` don't.
- `tagsOf(text)` returns an entry's topics, each folded for matching (`nbFold`: lower case, no accents) and shown as first written.
- The chips row shows every topic with its count, most used first, then by name; "All" first. One topic at a time; tapping the chosen one again clears it. Notes, lessons, journals and readings are just topics, with no separate kind.

## The entry sheet

- The note box's sheet, through `asSheet()`: on a touch screen or under 600 px a full-width sheet above the keyboard; with a mouse it floats. Its field grows with the text, as the note field does.
- Fields: the text (focused when it opens), then a date row with **Today**, **Yesterday** and a calendar chip, as Book details' Date written has.
- Save rules, as the note box: a tap outside or Escape saves; Cancel drops what was typed; an unchanged entry just closes; a new entry left empty is not saved.
- **Delete** in the sheet's head, as the word card's: the entry goes to the Trash with "Moved to Trash · Undo".

## Paste

- **Paste** on the tab reads the clipboard with `readClip()` (from the tap, with no `await` before it; see HANDOFF's gotcha) and opens a new entry's sheet with the text in it, ready to check and save.
- A paste into an empty entry's text field, or ⌘V on the tab outside any field, does the same.
- When the pasted text's first non-empty line is a date on its own (`isDateLine`: "March 3, 2024", "3 March 2024", "2024-03-03", "March 2024"), it becomes the entry's date and leaves the text (`pastedDate(text)` → `{ date, text }`). Typed text is never read for a date; the date row sets it.
- Only text is kept. A clipboard holding only a picture says "Commonplace keeps text only."
- One paste makes one entry. Splitting a long paste at its date lines waits (Later).

## Search, first and second step

- First step: the Commonplace tab has its own box, like the other two tabs today. Every word typed must appear in the entry's text after folding (`nbFold`), as on the other tabs; topics are part of the text, so `#lesson` finds them too.
- Second step: one box at the top of the Notebook, shared by Highlights, Words and Commonplace, replacing the three. While something is typed, each tab shows its count ("Highlights 12 · Words 3 · Commonplace 7"). Each tab keeps its own chips and filters.

## The Shortcut (third step)

"Save to Commonplace" in the iPhone share sheet: Show in Share Sheet, receive Text, URLs and Safari web pages (Get Clipboard when there's no input), URL Encode the input, then Open URLs `https://ngnnah.github.io/own-shelf/?entry=` + the encoded text, with an optional `&title=`.

- `entryFromShare(text, title)` in parse.js makes the entry's text: the title on the first line when given, then the shared text or link.
- Like `?add=`, the app saves at once, then opens Notebook → Commonplace with the entry's sheet open ("Saved to Commonplace"). The parameter leaves the address bar once used, so a reload doesn't save twice, and it survives a redirect sign-in.
- Open URLs opens Safari, not the home-screen app, and the two keep separate storage, so Safari must be signed in. Send to own-shelf works the same way today.

## Sync, offline and size

- Offline: Firestore's cache and queued writes, as for words. Local-only mode stores `entry:` keys in IndexedDB as they are.
- Loading works like words: the tab shows what's in memory at once, and each Notebook open reloads the entries (`all('entry:')`). At 1–2 KB an entry, 1,000 entries cost 1–2 MB and 1,000 reads per open, against 50k reads a day.
- Writes: one per save. The same entry saved on two devices: the later save wins, as for words.
- Before entries pass about 1,000, read only what changed (Later).

## Trash, Undo and backup

- Trash kind `entry`: `{ id, kind:'entry', deletedAt, entry }`. The row reads "Entry · <first line>" with the date. Restore and Undo put it back; Delete forever and the 30-day purge drop it.
- Backup: `{ …, entries }`, optional, so older backups still restore and the version stays 1. Restore adds entries missing by id; for an entry on both sides the newer `up` wins, so an old backup never undoes newer edits.

## Steps

1. The Commonplace tab: store.js, parse.js helpers, the tab, the sheet, paste, topics, months, the Trash, backup, tests.
2. One Notebook search box with counts on the tabs. It waits for step 1, since both change the tab bar and `nbTab()`.
3. `?entry=` and the Shortcut. It can run beside step 2: it touches the deep-link code, not the Notebook's.

Later, roughly in this order: Split at dates for a long paste (worth it once Nhat says where his old notes live); On this day (entries from this date in earlier months and years); make an entry from a highlight; read only what changed; export of entries; the books row in search; search inside every book.

## Tests

`npm test`, with synthetic data only:

- store: `entry:` goes to `entries` through the fake Firestore; `all('entry:')` includes queued writes.
- backup: `exportShelf` writes `entries`; `importShelf` adds the missing ones, keeps the newer `up`, skips malformed entries, and restores a backup without them.
- parse: `tagsOf` (accents, case, headings, `#fragment`, `&#39;`, a tag at the start, end and after punctuation, repeats); `pastedDate` (each date form, a date that isn't alone on its line, a blank first line, none); later `entryFromShare`.

`npm run test:browser`, in a new `commonplace.mjs` (listed in `run.mjs`): New entry, typing, the sheet's save rules (tap outside, Escape, Cancel, empty); Paste with a stubbed clipboard, a first-line date, a picture only; month headings and order; topic chips, counts and filtering, a tag tapped in a card; Markdown shown formatted; Show more; Delete, Undo, Restore and Delete forever; search; a backup round trip in local mode; a reload keeps everything. `overflow.mjs` adds the tab and the sheet at 375 and 320 px.
