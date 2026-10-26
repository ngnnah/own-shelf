# Commonplace book

Draft for Nhat, 2026-10-26. Not approved. Nothing is built.

## Goal

A place for Nhat's own notes, quotes, facts and snippets, with pictures, to look up later. An entry isn't tied to a book. It has a title, text, pictures and an optional source link. Capture is quick: a button, a paste, or the iPhone share sheet. One search box finds entries, highlights, notes, words and book titles.

## Three shapes compared

Any shape has to give quick capture, search, pictures, sync, offline use, backups and the Trash, and stay fast and inside the free Firestore plan with a few thousand entries. The limits that matter: 50k reads and 20k writes a day, 1 MiB per document, 1 GiB stored and 10 GiB downloaded a month (free plan); 700 KB per book chunk (`CHUNK_BYTES`); and Firestore's on-device cache, which holds about 40 MB by default (`loadFirebase` doesn't set `cacheSizeBytes`).

| | A new record kind | A special book | Notebook items |
|---|---|---|---|
| Shape | `entry:<id>`, one Firestore document per entry, like words | One book whose blocks are the entries | Entries stored as highlights in a host book's state |
| Reuses | The key/value API, the word card's picture code, the Trash, backups, the Notebook's tabs and list | The reader, highlights and notes, Find, Export, backups, the shelf | The Notebook's list and search, the Trash's highlight kind |
| New | An entry sheet, a tab, a deep link | A text editor, stable block ids, a Trash for single blocks | A hidden host book, pictures on highlights |
| Capture | Write one small document | Rewrite the whole book | Rewrite the host's whole state |
| Search | In memory, like words | Find covers one book; search across kinds is still new | Free |
| Pictures | Their own documents, each read once per device | Image blocks inside the chunks | Nowhere to put them |
| Sync | Per entry: two devices editing different entries never clash | Whole book: a capture on the phone is lost on the laptop's next save | Whole state: the same |
| Offline | Firestore cache and queued writes | The same | The same |
| Backups, Trash | One backup field, a Trash kind with Undo | Free; the Trash only knows the whole book | Free; the Trash treats an entry as a highlight |
| Firestore cost | One write a save; one read per entry when the list loads | Every chunk rewritten on each save | The whole state rewritten on each save |
| 1 MiB, 700 KB | An entry is 1–2 KB of text | Chunks stay under 700 KB, but there are hundreds | A state isn't chunked: about a thousand text entries fill its 1 MiB |
| A few thousand entries | Writes and sizes fine; reads need "read only what changed" (later) | Hundreds of writes and uploads per save | Doesn't fit |

**A special book** reuses the most, but its storage was built for text written once. `finalize` numbers blocks by position (`b0`, `b1`…) and highlights point at those ids, so inserting or deleting an entry shifts every highlight after it. `put('doc:…')` rewrites every chunk, and pasted pictures keep up to ~600 KB each (`shrinkImage`), so 1,000 pictures mean several hundred chunks rewritten on each save. Book content is read cache-first, so another device's new entries wouldn't show.

**Notebook items** fail as storage: a highlight is offsets into a book's blocks, kept in that book's `state:` document, which can't hold pictures or a few thousand entries. But this shape gets the place right. The Notebook is where you look things up, so entries should show there and share its search.

**Also considered: entries in the words collection.** Fact cards live in `words` as `kind:'fact'`, so an entry could be `kind:'entry'` with no store.js change. Then about eight places in the word code would have to skip entries: the Study queue, the Words tab's chips and search, dictionary lookups (`needs`, `enrich`), To sort, the restore guard, `restoreWord` and the Trash row. Two lines saved in store.js would cost more branches elsewhere.

**Recommendation:** entries as their own record kind, shown in a third Notebook tab, with one Notebook search box covering everything. It takes the storage of the first shape and the place of the third, follows the words pattern nearly line for line, and changes nothing in books, highlights or words.

## Each new piece, and the case against it

| New piece | What could do the job already | Why it's still worth it |
|---|---|---|
| `entries` collection (`entry:<id>`) | `words`, as fact cards do | Keeps the word code free of entry checks (above) |
| `pics` collection (`pic:<id>`) | Pictures inside the entry, as on word cards | Inline, each list load downloads every picture (1,000 at ~250 KB ≈ 250 MB), far past the 40 MB cache. Apart, a picture never changes, so each device reads it once. Books split the same way: a small `meta:` that is listed, a big `doc:` read cache-first |
| Commonplace tab | A chip in the Words tab | Entries have no meaning, dictionary or Study; the key feature shouldn't hide behind a chip |
| Entry sheet | The note box (a sheet above the keyboard on phones) and the word card's picture strip | It is those two put together: the note box's layout and save rules, the word card's pictures |
| `?entry=` deep link | `?text=`, which adds a book | A snippet isn't a book. One more name in `readDeepLink` |
| One Notebook search box | The Highlights and Words boxes | Replaces both; the matching code exists |
| A new module | None needed | Pure helpers go in parse.js and store.js, which Node already tests |

## Data model

```
entry:<id>  →  users/{uid}/entries/{id}
  { id, title, text, source, shelf, pics: [picId], added, up }
pic:<id>    →  users/{uid}/pics/{id}
  { id, src }        src: a JPEG data URL (see Pictures)
```

- `id`: `e` (a picture's: `p`) + time + random, like Trash ids.
- `title`: optional; the list shows the text's first line when it's empty.
- `text`: plain text with line breaks kept (`cleanText`); links in it are clickable.
- `source`: an http(s) link or `''`, the same rule as a book's source in Details.
- `shelf`: a category shelf id or `''` (see Topics). `pics`: picture ids, in order.
- `added` sorts the list. `up` is the last save: free now, and it lets "read only what changed" come later without a migration.
- An entry over 800 KB (the word card's `WORD_BYTES`) isn't saved: "Too long for one entry. Add it to the shelf as a book instead."

store.js gains `entry: 'entries'` and `pic: 'pics'` in `COLL`, `entry` in `LISTED`, and cache-first reads for `pic:`, since a picture never changes. The local adapter needs nothing. The Firestore rules need nothing (`users/{uid}/{document=**}` covers new collections), and neither does the service worker (no new files).

## Capture

**In the app.** New entry, at the top of the Commonplace tab, opens the entry sheet: title, text, pictures, source link, shelf. Tapping an entry opens it the same way. The sheet follows the note box's rules: a sheet above the keyboard on phones, floating with a mouse; a tap outside or Escape saves; Cancel drops what was typed; an unchanged entry just closes.

- Paste into the sheet: text goes into the field, a picture joins the pictures, as on the word card.
- Paste on the tab, outside any field: a new entry from the clipboard. Text becomes the text, a picture a picture, a lone link the source.
- Drop pictures on the tab to start a new entry with them, or on an open sheet or an entry card to add them there.

**The iPhone Shortcut "Save to Commonplace":**

1. Shortcuts → + → name it Save to Commonplace.
2. Details (ⓘ) → turn on Show in Share Sheet. Receive Text, URLs and Safari web pages. If there's no input: Get Clipboard, so running it from the home screen or Back Tap saves what you copied.
3. URL Encode the Shortcut Input.
4. Open URLs: `https://ngnnah.github.io/own-shelf/?entry=` followed by the URL Encoded Text.

The URL is `https://ngnnah.github.io/own-shelf/?entry=<encoded text or link>`, with an optional `&title=<encoded title>`. `entryFromShare` (parse.js) splits it: the first link becomes the source, the rest the text. Like `?add=`, the app saves at once, then opens Notebook → Commonplace with the entry's sheet open for a title, picture or shelf ("Saved to Commonplace"). The parameter leaves the address bar once used, so a reload doesn't save twice, and it survives a redirect sign-in.

Open URLs opens Safari, not the home-screen app, and the two keep separate storage, so Safari must be signed in with Google; in "this device only" mode the entry stays in Safari's copy. Send to own-shelf works the same way today. Android's share target keeps adding books, since an app has only one.

## Search

### First version

- One search box at the top of the Notebook, shared by its tabs. It replaces the Highlights and Words boxes.
- While something is typed, each tab shows its count ("Highlights 12 · Words 3 · Commonplace 7"), so a hit in another tab is one tap away. Books whose title or author match show as a row of links above the list.
- What is searched:
  - entries: title, text, the source's site, shelf name;
  - highlights: text, note, book title and author (as now);
  - words: term, meaning, synonyms, antonyms, sentences; fact cards: text, note, book (as now);
  - books: title and author, from the shelf entries already in memory.
- Matching stays as it is: every word typed must appear, after folding (lower case, no accents, đ→d). Curly quotes fold too, as in the reader's Find.
- The index is one folded string per item, built in memory when the Notebook loads. Nothing is stored or synced, so search adds no Firestore cost.
- Cost on a phone: 3,000 entries, 5,000 highlights and 1,000 words come to roughly 5–8 MB of text. Scanning that takes milliseconds to a few tens of milliseconds, and the box waits 150 ms after typing stops. Each tab draws its first 100 cards, then Show more, so a big result doesn't stall the page.

### Every book's full text

It would add hits inside the books themselves, opening a book at the passage as Find does for the open book. That needs every book's text on the device: a 300-page book is about 0.5–0.6 MB as stored, so 50 books and 200 articles come to roughly 40 MB.

- Speed: too slow for each keystroke on a phone. It has to run on Enter, one book at a time, with hits appearing as they're found.
- Cache: that much doesn't fit in the 40 MB cache beside everything else, so each search downloads the books it dropped. At 40 MB a search, a few hundred searches use the free 10 GiB a month.
- An index (word → places) on each device would make it instant, but it's the biggest new piece on offer: a store to build, keep current as books come and go, and rebuild on every device.

Recommendation: not in the first version. Later, a "Search inside every book" button under the results scans on demand with Find's folding, stops at 200 hits and opens a hit as Find does; `cacheSizeBytes` goes up with it. Build the index only if that's still too slow.

## Topics

Reuse the category shelves. An entry can sit on one shelf from the list books use (Travel, History, Philosophy…), picked in the sheet as in Details → Shelf. The Commonplace tab gets a shelf filter beside the search.

- The list, its editing (rename, move, delete) and the rule that an unknown shelf means Unsorted all exist. Deleting a shelf needs no entry writes: its entries just read as unsorted.
- One topic list then spans books and entries.
- For a second topic, type a hashtag in the text (#stoicism). Search finds it with no new code.
- Tags (several per entry, free-form) need a tag list, a picker, chips and renaming. Worth building only if one shelf plus hashtags falls short.

## Pictures

- Up to 6 per entry. Each picture is its own document, so the cap is about a tidy card, not Firestore.
- Size: 1,400 px on the long side, redone at 1,000 px and quality 0.7 when over ~300 KB. These are close to the Add dialog's numbers (`shrinkImage`), drawn on white as `shrinkPic` does so a transparent PNG doesn't turn black. The word card's 640 px suits an illustration, but it turns a phone screenshot (1179 × 2556) into about 295 × 640 px, too small to read.
- Budget: about 150–300 KB a picture, so 1,000 pictures take ~250 MB of the 1 GiB free storage that books, words and the Trash share.
- Cards show small thumbnails, loaded as they scroll into view; a tap opens the lightbox.
- Removing a picture deletes it at once, with no Undo, as on the word card.

## Sync, offline and a few thousand entries

- Offline: Firestore's cache and queued writes, as for words. Local-only mode stores `entry:` and `pic:` keys in IndexedDB as they are.
- Loading in the first version works like words: the tab shows what's in memory at once, and each Notebook open reloads the entries from the server (`all('entry:')`). At 1–2 KB an entry, 1,000 entries cost about 1–2 MB and 1,000 reads per load.
- Reads are the first limit. Before entries pass about 1,000, switch to reading only what changed: show the cached entries, ask the server for those whose `up` is newer than the last load (less a margin for clock drift), and compare the server's count (`getCountFromServer`, about one read per 1,000 entries) to catch deletions from another device, reloading everything once on a mismatch. Words can use it too. It's a new storage call with its own tests, so it waits.
- Writes: one per save, one per picture added. A few thousand entries never come near 20k a day.
- The same entry saved on two devices: the later save wins, as for words.

## Trash, Undo, backup and export

- Delete, in the sheet or on a card, asks nothing. The entry goes to the Trash with "Moved to Trash · Undo", as words do. Trash kind `entry`: `{ id, kind:'entry', deletedAt, title, entry }`. Its pictures stay in `pics` until the Trash lets go of the entry, as a removed book's content stays until it's purged. Delete forever and the 30-day purge delete them with it. The row reads "Entry · title" with a line of the text.
- Backup: `{ …, entries, pics }`, both optional, so older backups still restore and the version stays 1. Restore adds entries and pictures missing by id. For an entry on both sides, the newer `up` wins, so an old backup never undoes newer edits. Pictures make the file large (1,000 pictures ≈ 250 MB), which is fine for a download but slow to restore on a phone.
- Export, later: a Commonplace choice in the Export dialog. HTML embeds the pictures; Markdown and text mark each as "[picture]".

## First version, and later

The first version, the smallest useful one:

- store.js: the `entry:` and `pic:` kinds, backup and restore.
- The Commonplace tab: entries newest first, New entry, the entry sheet, paste and drop, the shelf filter, Delete with Trash and Undo.
- One Notebook search box, with counts on the tabs and the row of matching books.
- `?entry=` and the Save to Commonplace Shortcut.
- The tests below.

Later, roughly in this order:

- Read only what changed, before about 1,000 entries.
- A picture Shortcut: Receive Images → Copy to Clipboard → Open URLs `…/?entry=&paste=1`. The sheet opens ready to paste; iOS still asks for one tap.
- Export of entries.
- A title for link-only entries, fetched through the Worker (Readability's title).
- Search inside every book.
- Make an entry from a highlight. Study an entry as a re-read card, as fact cards without a blank already do.
- The shelf's search box offers to search the Notebook.

## Code

- store.js: `COLL`, `LISTED`, cache-first `pic:` reads, `exportShelf` and `importShelf`.
- parse.js: `entryFromShare(text, title)` → `{ title, text, source }`, using `firstUrl`.
- app.js: the tab and the sheet; `shrinkPic` and `addPics` take a size and a target so entries and word cards share them; the Trash kind; `readDeepLink` and `runIncoming`; the shared search.
- index.html and styles.css: the tab, the sheet, the cards.
- The `wordcard-phone` lane is turning the word card into a sheet on phones. Build the entry sheet after it lands, on the same code.

## Tests

`npm test`, with synthetic data only:

- store: `entry:` and `pic:` go to `entries` and `pics` through the fake Firestore; `all('entry:')` includes queued writes; `pic:` reads come from the cache when it has them; an entry with long text and six picture ids stays far under 1 MiB.
- backup: `exportShelf` writes `entries` and `pics`; `importShelf` adds the missing ones, keeps the newer `up`, skips malformed entries, and restores a backup that has neither.
- parse: `entryFromShare` with a lone link, text with a link, text only, a link with trailing punctuation, a title, and nothing.

`npm run test:browser`, in a new `commonplace.mjs`: the sheet's save rules (tap outside, Escape, Cancel); pasting text and a picture drawn on a canvas, the six-picture cap and removing one; `?entry=` with text, a link, both, and `&title=`; Undo, Restore, and Delete forever taking the pictures along; search counts, the books row, accents and curly quotes; the shelf filter and a deleted shelf; a backup round trip in local mode. `overflow.mjs` adds the tab and the sheet at 375 and 320 px.

## Open questions for Nhat

- Topics: one category shelf per entry, plus #hashtags that search finds, instead of tags? I'd say yes: the shelf list and its editing exist, and one topic list then spans books and entries.
- Full text of every book: leave it out of the first version and add a "Search inside every book" button later? I'd say yes: searching tens of MB on each keystroke is too slow on a phone, and an index is the biggest new piece on offer.
- Pictures: up to 6 per entry, each up to 1,400 px? I'd say yes: a screenshot at the word card's 640 px is too small to read.
- Pictures as their own documents (a `pics` collection), not inside the entry? I'd say yes: inside, every list load downloads every picture.
- Place: a third Notebook tab named "Commonplace", with New entry at its top? I'd say yes: the Notebook is where you look things up, and its tabs, list and search exist.
- One search box for the whole Notebook, with counts on the tabs, replacing the Highlights and Words boxes? I'd say yes: no new search code, and a mixed results list can come later if switching tabs gets tiresome.
- The Shortcut saves at once, then opens the entry for a title or picture? I'd say yes: it matches Send to own-shelf, and nothing shared is lost if you walk away.
- Plain text in entries (line breaks and links, no bold or lists) for now? I'd say yes: Markdown can come later through parse.js's `mdToBlocks`.
