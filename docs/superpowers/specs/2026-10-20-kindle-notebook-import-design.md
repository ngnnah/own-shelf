# Kindle notebook import

Approved by Nhat on 2026-10-20.

## Goal

Add Kindle "Notebook Export" .html files to the shelf, many at a time, with every highlight and note in place. A newer export of a book already on the shelf merges into it.

## What the reader sees

- Add to shelf → choose or drop one or more files. A Kindle export is recognised by its markup (`noteHeading` / `noteText` classes); every other file imports as before.
- Title and author come from the export. "Last, First" authors are flipped ("Abercrombie, Joe" → "Joe Abercrombie").
- Each `sectionHeading` (e.g. "Part VII") is a heading; the chapter in a note heading ("Like a King > Page 4 · Location 133") becomes a subheading wherever it changes. Each highlight is a passage, fully highlighted.
- Colors: yellow → Sunny; orange, pink, red → Coral; blue, purple → Sky; green, aqua → Mint; anything else → Sunny.
- A Kindle Note becomes the note on the highlight just before it, when its location falls inside that highlight; otherwise it is a passage of its own, highlighted, with itself as the note. Bookmarks are skipped. Page and location are not shown.
- One file: the usual review step; the detect line adds "· N Kindle highlights". Several files: each goes straight to the shelf, then one toast sums up ("Added 12 books · merged 2 · 1 couldn't be read").
- Drop hint: "PDF, .txt, .md, .html or a Kindle notebook — or drop them here".

## Merging

A Kindle book's id is `k` + hash of the export's own title and author (lowercased), so it is the same for every export of that book. Importing an export whose book is already on the shelf:

- rebuilds the book from the new export, keeping its added date and cover color;
- carries over every existing highlight (colors, notes, partial highlights made in own-shelf) by matching block type and text;
- adds a Kindle highlight for each passage that is new in this export; a passage that was already there keeps whatever own-shelf has for it, so a highlight removed in own-shelf stays removed;
- drops highlights whose passage is gone from the new export (deleted on the Kindle) and says how many in the toast;
- says "No new highlights" when nothing changed.

## Code

- `parse.js`
  - `isKindleNotebook(html)`, `kindleNotebook(html)` → `{title, author, blocks}`. Text-based (no DOMParser) so Node tests cover it; the export's markup is machine-generated and regular. Highlight blocks carry `kh: {color, note}`.
  - `kindleHighlights(doc, at)` → highlights from the `kh` blocks (and removes `kh`).
  - `mergeKindle(oldDoc, oldHl, newDoc, newHl)` → `{hl, added, dropped}`, pure.
  - `finalize(blocks, {verbatim: true})` skips title, byline, date and footnote guessing, so a first highlight like "By the dead, …" stays a passage.
- `app.js`: `loadFile` detects Kindle files; `addDoc(d, hl, opts)` takes highlights and a preset id, merges when the Kindle book exists, and can run quietly for a batch; the file picker, the dialog's drop zone and drop-anywhere take several files.
- `index.html`: `multiple` on the file input; the hint copy.

## Tests

- `npm test`: the parser on a synthetic fixture (sections, chapters, colors, notes inside and outside a highlight, bookmarks, entities, author flip), `verbatim`, and merge (notes and colors carried, new passages added, removed ones dropped, duplicate passage text).
- `npm run test:browser`: a new `kindle.mjs` imports a synthetic export, checks the highlights in the reader and the Notebook, merges a newer export, and adds three files at once.

Fixtures are synthetic: the repo is public.
