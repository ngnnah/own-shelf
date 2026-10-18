# Notes for Claude

Start by reading `HANDOFF.md`. It has the status, architecture, the ordered next steps and the gotchas.

- No build step: plain ES modules + CDN scripts. Keep it that way unless asked.
- Pin every CDN version (pdf.js 3.11.174, Readability 0.5.0, Firebase 10.12.2).
- The port is done: `app.js` is the source of truth. `legacy/app-artifact.html` mirrors the still-live artifact; change it only together with a republish of that artifact.
- Design changes (the own-shelf rebrand, new features) go through Nhat first; otherwise keep existing behaviour and copy.
- Data access goes through the `store.js` API only. Never `await` Firestore writes in UI paths; the adapter queues them.
- Run `npm test` after touching `worker/`, `store.js` or `parse.js`. Add tests for new parser or storage logic.
- Public repo: never commit articles, PDFs, backups or tokens. Use synthetic fixtures.
- Writing style: clean, coherent, concise, correct, comprehensive.
