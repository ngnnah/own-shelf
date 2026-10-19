# own-shelf

*Knowledge is power. Wisdom in the margins.*

A personal reading app, and one place to gather your readings and notes into practical wisdom. Put PDFs, pasted articles and web links on a bookshelf, read them with sections and checkpoints, highlight and annotate, and export your notes as Markdown, HTML or plain text. It syncs across devices through Firebase, or keeps everything on one device.

**Status:** live at https://ngnnah.github.io/own-shelf/ (local-only mode works; Google sign-in and sync wait on the Firebase setup). See [HANDOFF.md](HANDOFF.md) for the state, the architecture and the next steps.

## Run locally

```sh
npm test               # Worker, storage and parser tests
npm run test:browser   # headless-Chrome tests (run npm install once first)
npm run serve          # http://localhost:8080
npm run icons          # regenerate icons/ from design/icon.json
```

## Deploy

- **Site:** https://ngnnah.github.io/own-shelf/, GitHub Pages from `main` / root. There's no build step.
- **Data:** Firebase project `upwind-reader` (Google sign-in + Firestore). Publish `firestore.rules` in the console.
- **Link import:** paste `worker/worker.js` into a Cloudflare Worker and set `FIREBASE_PROJECT_ID`, `ALLOWED_ORIGINS` and `ALLOWED_EMAILS`.

Full one-time setup steps are in [HANDOFF.md](HANDOFF.md#one-time-setup-nhat).

This repo is public. Never commit reading material, PDFs or backups.
