# Notes for Claude

Start by reading `HANDOFF.md`. It has the status, architecture, the ordered next steps and the gotchas.

- No build step: plain ES modules + CDN scripts. Keep it that way unless asked.
- Pin every CDN version (pdf.js 3.11.174, Readability 0.5.0, Firebase 10.12.2).
- `legacy/app-artifact.html` is the working reference. When porting, preserve behaviour and copy; don't redesign.
- Port code from `legacy/app-script.js`, swapping its inline `DB` for the adapters in `store.js`.
- Data access goes through the `store.js` API only. Never `await` Firestore writes in UI paths; the adapter queues them.
- Run `npm test` after touching `worker/` or `store.js`. Add tests for new parser or storage logic.
- Public repo: never commit articles, PDFs, backups or tokens. Use synthetic fixtures.
- Writing style: clean, coherent, concise, correct, comprehensive.
