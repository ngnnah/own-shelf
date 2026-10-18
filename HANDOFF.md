# Hand-off: Upwind → GitHub Pages + Firebase

Upwind is Nhat's personal reading app: a bookshelf of PDFs, pasted articles and web pages, read in a playful layout with sections, checkpoints, highlights, notes and export. It began as a single-file Claude artifact. This repo moves it to **GitHub Pages** (hosting) + **Firebase** (Google sign-in, Firestore sync) + a **Cloudflare Worker** (link import).

- Repo: `ngnnah/reading-notes` (public; to be created) → site at `https://ngnnah.github.io/reading-notes/`
- Firebase project: `upwind-reader` (config is in `config.js`)
- Current live version (artifact): https://claude.ai/artifact/WeBG2owiR3FP4ff25uHXGn

## Status

| Piece | State |
|---|---|
| Working single-file app (all reader features) | Done — `legacy/app-artifact.html` |
| Split into site files | Partly — `styles.css` and `parse.js` are final; markup and script are in `legacy/` waiting to be ported |
| Storage adapters (`store.js`) | Written. Local adapter = proven artifact code. Cloud adapter unit-tested for chunking only; not yet run against real Firestore |
| Link-import Worker (`worker/worker.js`) | Written and unit-tested (16 tests pass: token checks, origin and email allowlist, private-address and redirect blocking, chunk sizes). Not yet deployed |
| Firestore rules | Written (`firestore.rules`), not yet published |
| `index.html`, `app.js`, sign-in, settings, URL import UI, PWA files | **Not started** — see Next steps |
| Migration from the artifact | **Not started** — artifact needs a "Back up shelf" export |

## File map

```
config.js            Firebase config, SDK version, optional default Worker URL
store.js             makeLocal() IndexedDB adapter, makeCloud() Firestore adapter, chunkBlocks()
parse.js             All parsing: PDF lines → blocks, Markdown, rich HTML paste, finalize() (title/author/date, notes, sections)
styles.css           All styles (light/dark tokens, shelf, reader, drawers, dialogs)
firestore.rules      Owner-only access rules
worker/worker.js     Cloudflare Worker: authenticated page/PDF fetcher
worker/worker.test.mjs  `npm test`
legacy/app-artifact.html   The complete working app as one file (reference + fallback)
legacy/markup.html          Its <body> markup, ready to become index.html
legacy/app-script.js        Its script (minus parser), ready to become app.js
legacy/test-fixture-rich-paste.html  Synthetic rich-paste sample for tests
```

## Architecture

- **No build step.** Plain ES modules served by GitHub Pages. CDN scripts: pdf.js 3.11.174 (cdnjs), `@mozilla/readability@0.5.0` (jsDelivr), Firebase JS SDK 10.12.2 ESM from `https://www.gstatic.com/firebasejs/10.12.2/…`. `parse.js` is a classic script that defines globals; `app.js` is a module.
- **Storage API** (both adapters): `get(key)`, `put(key, value)`, `del(key)`, `all('meta:')`, `watchMeta(cb)`, `flush()`. Keys: `meta:<id>`, `doc:<id>`, `state:<id>`, `settings:app`. The legacy script already calls `DB.get/put/del/all` with these keys, so porting is mostly swapping `DB`.
- **Firestore layout** under `users/{uid}/`:
  - `meta/{id}`: shelf entry (title, author, written, writtenSort, added, color, words, progress, hl count…)
  - `books/{id}`: book header (everything except `blocks`) + `nChunks`
  - `books/{id}/chunks/{i}`: `{ i, blocks: [...] }`, each under 700 KB (Firestore caps documents at 1 MiB)
  - `state/{id}`: `{ hl, pos, maxP, done, finished, opened }`
  - `settings/app`: e.g. `{ workerUrl }`
- **Offline:** initialise Firestore with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`. The cloud adapter never awaits `setDoc`, because offline it only resolves on reconnect. Reads try the server for ~2.5 s, then fall back to the cache. Book content is read cache-first.
- **Write budget:** the free plan allows 20k writes/day. The adapter coalesces `meta:` and `state:` writes (latest value wins) and flushes every 2.5 s. **Call `DB.flush()` on `pagehide` and on `visibilitychange` → hidden.**
- **Link import:** app → `GET {workerUrl}/?url=<link>` with `Authorization: Bearer <Firebase ID token>`. The Worker returns raw HTML/PDF/text plus an `X-Final-URL` header. The app then:
  1. If the response is a PDF, sends it through the existing `pdfBlocks()`.
  2. Otherwise parses the HTML with `DOMParser` and inserts `<base href=finalUrl>` so relative links and images resolve.
  3. Runs `new Readability(doc).parse()`.
  4. Calls `htmlToBlocks(article.content)`, then `finalize(blocks, { title: article.title, author: byline without "By ", written: publishedTime, source: finalUrl })`.

## Next steps (in order)

1. **Create `index.html`** from `legacy/markup.html`. Head contents:
   - `<meta viewport … viewport-fit=cover>` and the Google Fonts link (copy both from the artifact)
   - `<link rel=stylesheet href=styles.css>` and `<link rel=manifest href=manifest.webmanifest>`
   - `apple-touch-icon`
   - the pdf.js and Readability script tags, then `<script src=parse.js>`, then `<script type=module src=app.js>`

   Add a **sign-in screen** with two buttons: "Sign in with Google" and "Use on this device only".
2. **Create `app.js`** from `legacy/app-script.js`:
   - Delete the inline `DB` object and `migrate()`. Import `makeLocal`/`makeCloud` from `store.js` and config from `config.js`.
   - Boot sequence:
     1. Dynamically import the Firebase app, auth and firestore modules; if that fails, show the sign-in screen with the local option only.
     2. `onAuthStateChanged`: signed in → `DB = makeCloud(fs, db, uid, { onError: toast })` and subscribe `DB.watchMeta(list => { META = list; if (on shelf) renderShelf(); })`. Signed out → show the sign-in screen, unless `localStorage['upwind:mode'] === 'local'`, in which case `DB = makeLocal()`.
   - Sign-in: `signInWithPopup(auth, new GoogleAuthProvider())`, falling back to `signInWithRedirect` on `auth/popup-blocked`.
   - Replace the `claude.use('downloads')` export path with a plain `<a download>` from a Blob, and always show **Download file**.
   - Keep `armed()` (tap-twice confirm); `confirm()` works off-artifact too, but the current UI is fine.
   - Add sign-out to Settings and call `DB.flush()` before signing out.
3. **Settings dialog** (gear on the shelf): account email, sign out, "Link import helper URL" (saved to `settings:app`, falling back to `WORKER_URL`), **Back up shelf** (JSON) and **Restore from backup**. Backup format: `{ app: 'upwind', version: 1, exported, books: [{ meta, doc, state }] }`. On restore, skip existing ids but merge highlights by `h.id`.
4. **URL import UI:**
   - A "Paste a link" field plus an Import button in the Add dialog.
   - A **Paste** button using `navigator.clipboard.read()` (prefer `text/html`; if the text is a lone URL, import it as a link).
   - Deep link: on boot, read `?add=`, `?url=` or `?text=` (pull the first URL out of `text`), open the Add dialog and import, then `history.replaceState` to clean the address.
5. **PWA:**
   - `manifest.webmanifest`: `start_url` and `scope` set to `./`, `display: standalone`, theme `#2563A8`, background `#EAF1EC`, icons at 192 and 512 plus a maskable one. Add an Android `share_target` with `{ action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } }`.
   - `sw.js`: network-first for same-origin files with a cache fallback, stale-while-revalidate for CDN scripts and fonts, and no caching of `*.googleapis.com` or the Worker.
   - Icons: the boat on a sea-blue square (the boat SVG `<symbol>` is in the markup).
6. **Artifact migration:** the artifact's data lives in the claude.ai origin's IndexedDB, which the new site can't reach. Add a **Back up shelf** button to the artifact. It already has the `downloads` capability; save `.json` via `downloads.save`. Republishing the artifact needs a claude.ai session with the Artifact tool; the artifact URL is above. Then restore the backup in the new app.
7. **Test locally:** run `npm run serve`, open `http://localhost:8080`, and add `localhost` to Firebase authorized domains (it's there by default). Check:
   - adding a PDF, rich paste and Markdown
   - highlights crossing list items
   - footnotes are selectable and highlightable
   - export in all 3 formats
   - two browsers signed in to the same account see each other's shelf changes
   - an offline reload still opens books
8. **Ship:** push to `main`, then GitHub → Settings → Pages → deploy from branch `main` / root.

## One-time setup (Nhat)

1. **GitHub:** create a public repo `reading-notes` (empty).
2. **Firebase console** (`upwind-reader`):
   - Authentication → Sign-in method → enable **Google**.
   - Authentication → Settings → Authorized domains → add `ngnnah.github.io`.
   - Firestore Database → create a database in production mode. Pick a region near you, e.g. `asia-northeast1` (Tokyo); it can't be changed later.
   - Firestore → Rules → paste `firestore.rules` → Publish. Consider the email-locked variant in the comment.
3. **Cloudflare** (free plan): Workers & Pages → Create → Worker. Paste `worker/worker.js` and Deploy. Then Settings → Variables and Secrets:
   - `FIREBASE_PROJECT_ID` = `upwind-reader`
   - `ALLOWED_ORIGINS` = `https://ngnnah.github.io,http://localhost:8080`
   - `ALLOWED_EMAILS` = your Google email

   Copy the `*.workers.dev` URL into the app's Settings, or into `WORKER_URL` in `config.js`.
4. **iPhone Shortcut** "Send to Upwind" (Show in Share Sheet; accepts URLs and Safari web pages): **URL Encode** the Shortcut Input → **Open URLs** `https://ngnnah.github.io/reading-notes/?add=` followed by the encoded URL. After step 4 of Next steps, sharing any page from Safari imports it.

## Decisions and why

- **Firestore, not Firebase Storage:** Storage now needs the Blaze plan. Pasted images are compressed into the book's chunks instead. Keep `shrinkImage` at ≤1400 px; if a data URL exceeds ~600 KB, retry at 1000 px / 0.7 quality so a single image never breaks the 700 KB chunk budget.
- **Cloudflare Worker, not Cloud Functions:** Functions need Blaze; Workers are free (100k requests/day). The Worker is locked to your origin, your email and verified Firebase tokens, so it can't be used as an open proxy.
- **Client-side Readability:** this keeps the Worker a dumb, auditable fetcher and lets extraction improve without redeploying it.
- **Public repo:** GitHub Pages on a free account requires one. The code holds no data; Firebase config values aren't secrets.
- **Local-only mode** stays as an escape hatch: offline first load, no account, or a Firebase outage.

## Gotchas

- Firestore rejects `undefined` values and arrays nested directly in arrays. The adapter strips `undefined` via JSON round-trip. Current data has no nested arrays; keep it that way, e.g. never store `[[s,e]]`.
- **Sign-in on iOS:** do `signInWithPopup` from a tap. If redirect sign-in is ever needed, Safari's storage partitioning breaks it while `authDomain` is `upwind-reader.firebaseapp.com`. The fix is serving the site from a custom domain and following Firebase's "redirect best practices".
- **iOS home-screen apps** have storage separate from Safari, so the user signs in once in each. Sync makes this harmless.
- **Highlights** are stored as character offsets into each block's `text`. Re-parsing a book changes ids and offsets, so never silently re-parse stored books.
- **Copyright:** don't commit articles, PDFs or backups to this public repo (`.gitignore` covers the common cases). Test with your own fixtures, like `legacy/test-fixture-rich-paste.html`.
