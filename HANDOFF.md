# Hand-off: own-shelf (formerly Upwind) → GitHub Pages + Firebase

A personal reading app: a bookshelf of PDFs, pasted articles and web pages, read with sections, checkpoints, highlights, notes and export. It began as a single-file Claude artifact called Upwind. This repo runs it on **GitHub Pages** (hosting) + **Firebase** (Google sign-in, Firestore sync) + a **Cloudflare Worker** (link import).

- Repo: [`ngnnah/own-shelf`](https://github.com/ngnnah/own-shelf) (public). Live site: https://ngnnah.github.io/own-shelf/ (GitHub Pages from `main` / root)
- Firebase project: `upwind-reader` (config in `config.js`)
- Old app (artifact, still live): https://claude.ai/artifact/WeBG2owiR3FP4ff25uHXGn. It now has a **Back up shelf** button for migration.
- Look: rebranded to own-shelf on 2026-10-19: an arm-shaped wooden bookshelf mark, parchment / walnut / library-green / oxblood palette, EB Garamond headings with Newsreader for reading, library motifs in the reader (bookmark-ribbon progress marker, straight spine rail, fleurons, "The end."). Internal ids keep the old name: `upwind:*` localStorage keys, the `upwind` IndexedDB, `app: 'upwind'` in backups, the `upwind-reader` Firebase project.

## Status

| Piece | State |
|---|---|
| Site files (`index.html`, `app.js`, `styles.css`, `parse.js`, `store.js`) | Done. Ported from the artifact; behaviour and copy preserved |
| Sign-in (Google, or "this device only"), settings, backup/restore | Done. Google sign-in works in Safari and desktop browsers (popup). The iPhone home-screen app can't finish it while `authDomain` is `upwind-reader.firebaseapp.com`, so tapping Sign in there says so and points to Safari. Firebase's helper pages are self-hosted in `__/auth/` (copied unchanged from `upwind-reader.firebaseapp.com/__/auth/`; the service worker leaves `__/` alone). To finish: add `https://ngnnah.github.io/own-shelf/__/auth/handler` as a redirect URI of the OAuth web client, then set `authDomain: "ngnnah.github.io/own-shelf"` (see `config.js`); the home-screen app then uses redirect sign-in |
| Firestore adapter | Unit-tested against a fake Firestore that rejects what the real one rejects. Not yet run against real Firestore |
| Link import (Worker + Readability), Paste button, `?add=`/`?url=`/`?text=` deep links | Done. Worker deployed (`own-shelf-fetch`), set in `config.js`; link import tested on the live site |
| PWA (manifest, Android share target, service worker, icons) | Done. Offline reload tested in Chrome |
| Artifact → app migration | Done and tested end to end (artifact backup → app restore → highlights show) |
| Kindle-style essentials | Done and browser-tested: Notebook (every highlight across books, with search and filters; replaces the shelf's "Export notes" button), search inside a book, "With note" filter in the highlights drawer. Bookmarks skipped |
| Firestore rules | Written, not published |
| Safety: typed "yes" and the Trash | Clear all, removing a book with highlights, and Empty Trash need "yes" typed. Removed books, highlights, cleared notes and words go to the Trash (Settings → Trash) for 30 days and can be restored; each such delete shows "Moved to Trash · Undo" for 6 s (longer while hovered or focused). Delete forever and Empty Trash have no Undo. A removed book's content stays in `doc:`/`state:` until it's purged |
| Finishing a book | Counts only when the end is on screen after real reading time: 30% of the estimated minutes, at least 20 s, accrued while the page is visible and you've interacted in the last 90 s. The cover shows "✓ Finished" (the cover ribbon is gone; ribbon now only marks reading position). Details always shows the state with a manual override: "Reading · N% / Mark as finished" or "✓ Finished / Mark as reading". Mark as reading resets progress to the sections reached and the reading time, so finishing on its own needs fresh reading. The 30% rule applies to Kindle notebooks too (Nhat's call, 2026-10-20) |
| Kindle notebooks | Done and browser-tested. A Kindle "Notebook Export" .html becomes a book of its highlights: parts as sections, chapters as subheadings, each passage highlighted in its Kindle color (yellow → Sunny; orange → Amber; pink, red → Coral; blue, purple → Sky; green, aqua → Mint; re-importing moves a highlight that came in as Coral from orange to Amber unless it was recoloured), notes on their highlights, bookmarks skipped, page/location not shown. On the shelf it has a ruled-paper notebook cover (margin line, punched holes, no label) so it reads as notes, not the full text; the List view's swatch is ruled too. Kindle books are recognised by their id (`k` + one hash, see `isKindleId`), so books imported before the cover existed get it too. A newer export of the same book merges into it (spec: `docs/superpowers/specs/2026-10-20-kindle-notebook-import-design.md`). The Add dialog and drop-anywhere take several files at once (any type) and add them without the review step |
| Arranging and covers | Arrange by Date added, Date written, Author or Title. Title shelves books under their first letter, ignoring a leading "The", "A" or "An" and accents (anything else under "#"); the List view's Title column sorts the same way. Details has a Cover row with the eight cloth bindings to override the colour picked at adding (hidden for Kindle notebooks, which keep the ruled cover) |
| Vocabulary | Select a word → toolbar **Word**: saved with its sentence; meaning from Datamuse, then Wiktionary (free, no key), editable on the word card; saved words are underlined in the text. Notebook → **Words** tab: search, book filter, jump to the sentence, due count, **Study**. Study: flashcards on a small SM-2-style schedule (vocab.js), Word → meaning or Sentence → word, up to 20 new a day, `?study=1`. Words are `word:<id>` (Firestore `users/{uid}/words`), in backups and the Trash. **To sort** (Words tab chip): every coral highlight (Kindle red/pink) waits to be sorted: tap words to save them with that sentence, select a phrase to blank it, then Fact (a cloze card, or re-read without a blank) or Skip; Make the rest facts. Fact cards are `word:` entries with `kind:'fact'` and study alongside words |
| Length on the shelf | Each cover shows its word count and a block of page edges whose thickness grows with length (log scale, 3–32 px); the List view has a sortable Length column (hidden on phones) |
| Colour meanings | Five highlight colours (keys 1–5), named by meaning everywhere: Sky "Important", Coral "Facts & words", Amber "Quotes", Sunny "Lesser", Mint "Other". Settings → Colour meanings renames them. The Notebook, the reader's highlights drawer and the export can group by colour, in that order |
| Taglines | "Knowledge is power. Wisdom in the margins." together under "Your shelf" (every screen size); "Knowledge is power." under the wordmark on sign-in; "Wisdom in the margins." on sign-in, as the Notebook subtitle and in the metadata |
| own-shelf rebrand | Done: icons (`npm run icons` from `design/`), theme, shelf, sign-in, reader motifs. Checked in light and dark at phone and desktop sizes |
| GitHub Pages | Live since 2026-10-18; every push to `main` deploys. Checked in headless Chrome: boots, Firebase SDK loads, local mode works, service worker active |
| Own shelves for others | README → Make your own shelf: fork, Pages, a Firebase project of your own, `config.js`, the optional Worker. Errors from a missing setup step name the console setting and the project (`setupError` in `app.js`; `tests/browser/setup.mjs` fakes the SDK). MIT license. Not yet followed end to end on a fresh Firebase project |

Tests: `npm test` (110 unit checks: Worker, storage with a fake Firestore including the trash, parser including Kindle exports and merging, vocabulary) and `npm run test:browser` (411 headless-Chrome checks: the local-only flow, Notebook, search, the note filter, typed-"yes" deletes, the Trash, length on the shelf, finishing, arranging by title and cover colours, Kindle notebooks, words and Study, To sort and fact cards, artifact → app migration, link import's article extraction, setup errors). Run `npm install` once first; the browser suite needs Chrome (`CHROME_PATH` off macOS), python3 and a network connection. `TEST_PORT_OFFSET` shifts its ports so two checkouts can run it at once. Both pass as of 2026-10-22.

## File map

```
index.html           Markup: sign-in screen, shelf, reader, dialogs (import, details, export, settings)
app.js               The app (ES module). Ported from legacy/app-script.js plus accounts, settings, link import, deep links, boot
store.js             makeLocal() IndexedDB adapter, makeCloud() Firestore adapter, chunkBlocks(), exportShelf()/importShelf()
parse.js             Classic script, globals: PDF lines → blocks, Markdown, rich HTML, Kindle notebook exports, finalize(), mergeKindle(), firstUrl(), decodeBody()
styles.css           All styles (light/dark tokens)
config.js            This deployment's Firebase config and Worker URL; the only file a fork edits
sw.js                Service worker (offline app shell)
manifest.webmanifest PWA manifest with the Android share target
icons/               mark.svg, mark-small.svg (the logo), icon.svg (favicon), icon-192/512.png, icon-maskable-512.png, apple-touch-icon.png; all generated by `npm run icons`
design/              arm-lab.html (the parametric logo lab), icon.json (the chosen settings), export-icons.mjs
firestore.rules      Owner-only access rules
worker/worker.js     Cloudflare Worker: authenticated page/PDF fetcher
*.test.mjs, worker/worker.test.mjs, test-util.mjs   npm test (unit)
tests/browser/       npm run test:browser (headless Chrome via puppeteer-core; screenshots in tests/browser/out/, gitignored)
tests/fixtures/      Synthetic Kindle notebook export (the real markup, made-up text), used by both suites
legacy/              The artifact as one file (app-artifact.html, kept identical to the live version), its split markup/script, a synthetic test fixture
```

## Architecture

- **No build step.** Plain ES modules on GitHub Pages. CDN scripts: pdf.js 3.11.174 (cdnjs), `@mozilla/readability@0.5.0` (jsDelivr), Firebase JS SDK 10.12.2 ESM from gstatic, imported dynamically by `app.js`. `parse.js` is a classic script (`defer`) whose globals `app.js` uses.
- **Boot:** read any deep link → register the service worker → if `localStorage['upwind:mode']` is `"local"`, start the local adapter right away → load Firebase → `onAuthStateChanged`: signed in → cloud adapter; signed out → sign-in screen (unless local mode). If Firebase can't load, the sign-in screen offers local mode only.
- **Storage API** (both adapters): `get`, `put`, `del`, `all('meta:')`, `watchMeta(cb, onErr)`, `flush()`. `watchMeta` always reports the shelf once, then remote changes (cloud only). Keys: `meta:<id>`, `doc:<id>`, `state:<id>`, `settings:app`.
- **Firestore layout** under `users/{uid}/`: `meta/{id}` (shelf entry), `books/{id}` (book header + `nChunks`), `books/{id}/chunks/{i}` (`{ i, blocks }`, each under 700 KB), `state/{id}` (`{ hl, pos, maxP, done, finished, opened }`), `settings/app` (`{ workerUrl }`), `trash/{id}` (removed books, highlights and notes; purged after 30 days).
- **Offline:** Firestore uses `persistentLocalCache` with the multi-tab manager. The cloud adapter never awaits `setDoc`. Reads try the server for ~2.5 s, then the cache; book content is read cache-first. The service worker serves the app files: network first (4 s) for same-origin files, stale-while-revalidate for CDN scripts and fonts, and it never touches Firestore, Google sign-in or the Worker.
- **Write budget:** 20k writes/day on the free plan. `meta:` and `state:` writes are coalesced (latest wins) and flushed every 2.5 s, on `pagehide`, on `visibilitychange` → hidden, and before sign-out.
- **Link import:** `GET {workerUrl}/?url=<link>` with `Authorization: Bearer <Firebase ID token>`. PDF responses go through `pdfBlocks()`; text/plain and Markdown through `mdToBlocks()`; HTML is decoded with its charset, parsed with `DOMParser`, given `<base href=finalUrl>`, has its `<article>` headers unwrapped (`liftArticleHeaders()`; otherwise Readability drops a summary or standfirst there), run through Readability, then `htmlToBlocks()` and `finalize()` with Readability's title, byline and published date.
- **Backup format:** `{ app: 'upwind', version: 1, exported, books: [{ meta, doc, state }] }`. Restore adds missing books and merges highlights by `h.id` into books already on the shelf; shelf entries are rebuilt with `metaFor()`.

## Next steps (in order)

1. **One-time setup: done** (2026-10-20; below): Firebase with the email-locked rules, the Cloudflare Worker.
2. **Test cloud mode locally:** `npm run serve`, open `http://localhost:8080` (localhost is an authorized domain by default). Check: Google sign-in; add a PDF, a rich paste and a Markdown file; two browsers signed in to the same account see each other's changes; an offline reload while signed in still opens books; link import after putting the Worker URL in Settings; the Paste button; `?add=<url>`.
3. **Migrate:** in the artifact, tap **Back up shelf** and save the `.json`. In the new app: Settings → **Restore from backup**. Don't commit the file (it's gitignored).
4. **Rebrand: done** (2026-10-19). To change the icon: open `design/arm-lab.html` in a browser, load `design/icon.json` (see the comment at the top of the file), tune, save the settings back into `design/icon.json`, then `npm run icons` regenerates every file in `icons/`.
5. **iPhone Safari pass: done** (Nhat, 2026-10-20). The main flow: in another iOS app (e.g. MIT Technology Review) select all and copy an article → own-shelf → Add to shelf → paste → read and annotate. Paste is the main path for paywalled sources, because link import fetches without the reader's login. On a real iPhone also check: selection and highlighting (iOS's own callout vs our bottom-docked toolbar), the Paste button's permission bubble, home-screen install, and the Shortcut below.
6. **Shipped:** Pages is on (with `.nojekyll`); pushing `main` deploys.

## One-time setup (Nhat)

The general steps for any copy are in [README → Make your own shelf](README.md#make-your-own-shelf). These are this deployment's.

1. **Firebase console** (`upwind-reader`):
   - Authentication → Sign-in method → enable **Google**.
   - Authentication → Settings → Authorized domains → add `ngnnah.github.io`.
   - Firestore Database → create a database in production mode, in a region near you, e.g. `asia-northeast1` (Tokyo); it can't be changed later.
   - Firestore → Rules → paste `firestore.rules` → Publish. Prefer the email-locked variant in its comment, so strangers can't use your quota. Put your email in the console only, not in this public repo.
   - Google Cloud console → APIs & Services → Credentials → "Browser key (auto created by Firebase)":
     - **API restrictions:** Firebase APIs only (Identity Toolkit, Token Service, Cloud Firestore). Never the Generative Language (Gemini) API.
     - **Website restrictions:** `https://ngnnah.github.io/*`, `http://localhost:8080/*` and `https://upwind-reader.firebaseapp.com/*`; sign-in breaks without the last one.

     GitHub secret scanning flags this key (alert #1). It's a Firebase web key, public by design, so close the alert as "Won't fix"; don't rotate it.
2. **Cloudflare** (free plan; done 2026-10-20 as `own-shelf-fetch`): Workers & Pages → Create application → Start with Hello World! → Deploy, then Edit code: paste `worker/worker.js` and deploy. Settings → Variables and Secrets:
   - `FIREBASE_PROJECT_ID` = `upwind-reader`
   - `ALLOWED_ORIGINS` = `https://ngnnah.github.io,http://localhost:8080`
   - `ALLOWED_EMAILS` = every Google email that may import links, comma-separated

   `WORKER_URL` in `config.js` points at it, so every account gets link import; a URL in the app's Settings overrides it.
   **Family accounts:** each person signs in with their own Google account and gets their own shelf. Add their email to `ALLOWED_EMAILS` and to the email-locked Firestore rule. Everyone shares the free Firebase quota.
3. **iPhone Shortcut** "Send to own-shelf" (Show in Share Sheet; accepts URLs and Safari web pages): **URL Encode** the Shortcut Input → **Open URLs** `https://ngnnah.github.io/own-shelf/?add=` followed by the encoded URL.

## Decisions and why

- **Firestore, not Firebase Storage:** Storage needs the Blaze plan. Pasted images are compressed into the book's chunks: `shrinkImage` caps at 1400 px and redoes an image over ~600 KB at 1000 px / 0.7 quality, so one image never breaks the 700 KB chunk budget.
- **Cloudflare Worker, not Cloud Functions:** Functions need Blaze; Workers are free (100k requests/day). The Worker only answers your origin, your email and verified Firebase tokens, so it isn't an open proxy.
- **Client-side Readability:** keeps the Worker a dumb, auditable fetcher, and extraction can improve without redeploying it.
- **Service worker kept:** it's the only way the app itself opens offline; Firestore caches data, not the app files.
- **Deep links add the book straight away** after a successful fetch (one tap from the share sheet); the dialog's **Import** button fills the dialog for review instead.
- **A lone link pasted into the paste box imports as a link** when signed in with a helper URL set; otherwise it pastes as text, as before.
- **Backup/restore lives in `store.js`** so Node tests cover it.
- **Kindle exports are read as text, not with DOMParser:** the markup is machine-made and regular, and it keeps the parser under Node tests. A Kindle book's id is `k` + hash of the export's own title and author, so every export of a book has the same id and a newer one merges: old blocks map to new ones by type and text, own-shelf colors, notes and partial highlights carry over, a Kindle highlight is added only for a new passage (so one removed in own-shelf stays removed), and highlights on passages gone from the export are dropped (the toast counts them).
- **Public repo:** GitHub Pages on a free account requires one. The code holds no data; Firebase web config values aren't secrets.
- **Local-only mode** stays as an escape hatch: no account, offline first load, or a Firebase outage.

## Gotchas

- Firestore rejects `undefined` values and arrays directly inside arrays. The adapter strips `undefined` via a JSON round trip; never store something like `[[s,e]]`. The fake Firestore in `store.test.mjs` enforces both.
- **Same origin, same data:** the local adapter and the artifact use the same IndexedDB name and keys. Serve `legacy/app-artifact.html` and the app from different origins when testing (e.g. `127.0.0.1` vs `localhost`), or they share one shelf.
- **Sign-in on iOS:** call `signInWithPopup` from a tap. Redirect sign-in breaks in Safari while `authDomain` is `upwind-reader.firebaseapp.com` (storage partitioning). In an iOS home-screen app Firebase 10.12.2 opens its "popup" as a plain link with no window handle, so it never throws `auth/popup-blocked` and never reports back; only redirect through a helper on this site (Firebase's redirect best practices, option 4: `__/auth/`) can work there. `authDomain` with a path (`ngnnah.github.io/own-shelf`) is undocumented: the SDK just builds `https://${authDomain}/__/auth/handler`. Re-test sign-in after any Firebase upgrade, and refresh `__/auth/` from `upwind-reader.firebaseapp.com/__/auth/` then too. A deep link stays in the address bar until the app consumes it, so it survives a redirect sign-in.
- **iOS home-screen apps** keep storage separate from Safari, so you sign in once in each.
- **Highlights** are character offsets into each block's `text`. Re-parsing a book changes ids and offsets, so never silently re-parse stored books. (Kindle merging re-parses on purpose and remaps every highlight by passage text.)
- **Kindle exports skip `finalize`'s guessing** (`verbatim`): otherwise a first highlight like "By the dead, …" becomes the byline, and a part called "Notes" becomes footnotes. Only English headings are recognised as Note or Bookmark; in other languages a note imports as a highlight.
- **`config.js` belongs to each deployment:** forks replace its values, so keep app settings and versions (the Firebase SDK version is in `app.js`) out of it, or every Sync fork conflicts.
- **Service worker:** `SHELL` in `sw.js` must list files that exist, or installation fails. App files are network-first, so deploys show up on the next online load without bumping `CACHE`.
- **Copyright:** never commit articles, PDFs or backups to this public repo (`.gitignore` covers the usual names). Test with synthetic fixtures such as `legacy/test-fixture-rich-paste.html`.
