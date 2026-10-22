# own-shelf

*Knowledge is power. Wisdom in the margins.*

A personal reading app, and one place to gather your readings and notes into practical wisdom. Put PDFs, pasted articles, web links and Kindle notebook exports on a bookshelf, read them with sections and checkpoints, highlight and annotate, and export your notes as Markdown, HTML or plain text. It syncs across devices through Firebase, or keeps everything on one device.

**Try it:** https://ngnnah.github.io/own-shelf/ and pick **Use on this device only**. No account needed; your books stay in that browser. Sign-in on that site is for its owner's family. To sync your own shelf across your devices, make your own copy; it's free.

## Make your own shelf

Your copy runs on your own GitHub Pages site and your own Firebase project, so your books and notes live in your account, not anyone else's. Everything below fits the free plans.

1. **Fork this repo.** In your fork: Settings → Pages → Deploy from a branch → `main`, `/ (root)`. Your site is at `https://<you>.github.io/<repo>/`.
2. **Create a Firebase project** at https://console.firebase.google.com (the free Spark plan is enough; Analytics isn't needed).
   - Project settings → General → Your apps → add a **Web** app. Skip Firebase Hosting. Copy the `firebaseConfig` object it shows.
   - Authentication → Get started → Sign-in method → **Google** → Enable.
   - Authentication → Settings → Authorized domains → add `<you>.github.io`.
   - Firestore Database → Create database, in production mode, in a region near you (it can't be changed later).
   - Firestore → Rules → paste [`firestore.rules`](firestore.rules) → Publish. Use the email-locked line from its comment, with your own email (and your family's), so strangers can't use your quota.
3. **Edit [`config.js`](config.js)** in your fork: paste your `firebaseConfig`, and set `WORKER_URL` to `""` until you have a link-import helper (step 6). It's the only file you change. Commit it; Pages redeploys on every push to `main`.
4. **Lock the API key** (recommended). Google Cloud console → APIs & Services → Credentials → "Browser key (auto created by Firebase)":
   - API restrictions: Identity Toolkit API, Token Service API, Cloud Firestore API.
   - Website restrictions: `https://<you>.github.io/*`, `http://localhost:8080/*` and `https://<project-id>.firebaseapp.com/*`. Sign-in breaks without the last one.

   GitHub may flag the key as a leaked secret. It's a Firebase web key, public by design (the Firestore rules protect your data), so close the alert as "Won't fix".
5. **Open your site and sign in with Google.** If a setup step is missing, the sign-in screen names the setting to fix.
6. **Link import** (optional; without it you can still paste articles and add files). Cloudflare, free plan: Workers & Pages → Create application → start from Hello World → deploy, then edit the code: paste [`worker/worker.js`](worker/worker.js) and deploy again. Settings → Variables and Secrets:
   - `FIREBASE_PROJECT_ID`: your `projectId`
   - `ALLOWED_ORIGINS`: `https://<you>.github.io,http://localhost:8080`
   - `ALLOWED_EMAILS`: the Google accounts that may import links, comma-separated

   Put the Worker's `*.workers.dev` URL in `WORKER_URL` in `config.js`.
7. **iPhone share sheet** (optional): a Shortcut "Send to own-shelf" (Show in Share Sheet; accepts URLs and Safari web pages): **URL Encode** the Shortcut Input → **Open URLs** `https://<you>.github.io/<repo>/?add=` followed by the encoded URL.

**Updates:** your fork's GitHub page has a **Sync fork** button that brings in new features. `config.js` is yours; new versions keep their settings elsewhere, so it rarely needs merging.

**Free-plan limits:** Firestore stores 1 GiB and allows 20,000 writes a day (own-shelf batches reading progress, so a long session costs a handful); Cloudflare Workers allow 100,000 requests a day.

## Run locally

```sh
npm test               # Worker, storage and parser tests
npm run test:browser   # headless-Chrome tests (run npm install once first)
npm run serve          # http://localhost:8080 (Firebase allows localhost by default)
npm run icons          # regenerate icons/ from design/icon.json
```

There's no build step: plain ES modules, served as they are. [HANDOFF.md](HANDOFF.md) has the architecture, the decisions and the gotchas.

This repo is public. Never commit reading material, PDFs or backups.

## License

[MIT](LICENSE)
