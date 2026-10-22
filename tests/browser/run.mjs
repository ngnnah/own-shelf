// Browser tests: drive own-shelf end to end in headless Chrome, in local mode ("this device only").
//   smoke.mjs       sign-in screen, local mode, rich paste, nested lists, highlights (in a block, across list
//                   items, in a footnote), Markdown upload, export in md/html/txt, reload, settings,
//                   backup and restore, ?add= deep link, service worker and offline reload
//   notebook.mjs    the Notebook: every highlight across books, chips, search, book filter, export, open at a highlight
//   search.mjs      search inside a book: accent folding, counts, the 200 cap, marking the match, Enter, Escape
//   notefilter.mjs  the "With note" chip in the highlights drawer
//   deletes.mjs     deletes that lose highlights or notes ask for "yes"
//   trash.mjs       the Trash: removed books, highlights and notes, restore, delete forever, the 30-day purge
//   length.mjs      each book's length on the shelf: the cover's word count, the page block, the list's Length column
//   finish.mjs      finishing a book: real reading time needed, the cover's ✓ Finished, the manual override in Details
//   shelf.mjs       arranging the shelf by title (shelves and List view), picking a cover colour in Details
//   kindle.mjs      Kindle notebook exports: review step, highlights and notes, merging, several files at once, the notebook cover
//   words.mjs       vocabulary: Word in the toolbar, the word card and its looked-up meaning (dictionaries mocked), the
//                   underline in the text, the Notebook's Words tab (search, book filter, open at the word), the Trash
//   migrate.mjs     the artifact's "Back up shelf" (legacy/app-artifact.html) → the app's "Restore from backup"
//   study.mjs       Study flashcards: the queue (due first, the daily new-word cap), front and back, ratings and
//                   their saved schedule, Again, keys, Sentence → word, done and empty states, ?study=1
//   linkimport.mjs  link import's article extraction: a summary in the article's <header> survives Readability
//   sort.mjs        To sort: Coral highlights (Kindle red, pink, orange too) become words (tap) or fact cards (a
//                   selected phrase as the blank), Skip and Show skipped, Make the rest facts, the sorting surviving
//                   a Kindle re-import, the Facts chip, the Trash, fact cards in Study
// Every file also fails on any page error.
//
// Run: `npm install` once, then `npm run test:browser`. One file: `node tests/browser/search.mjs`.
// Either takes an optional repo directory (default: this repo).
// Needs Google Chrome (set CHROME_PATH if it isn't at the macOS default), python3 (each file serves the repo
// with `python3 -m http.server` on its own port, so files can also run in parallel) and a network
// connection: fonts, the Firebase SDK and pdf.js load from CDNs.
// Fixtures are synthetic: legacy/test-fixture-rich-paste.html, tests/fixtures/kindle-notebook.html,
// tests/fixtures/article-header-summary.html and Markdown written to a temp dir at run time.
// Screenshots go to tests/browser/out/ (gitignored).
import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const files=['smoke.mjs','notebook.mjs','search.mjs','notefilter.mjs','deletes.mjs','trash.mjs','length.mjs','finish.mjs','shelf.mjs','kindle.mjs','words.mjs','study.mjs','sort.mjs','migrate.mjs','linkimport.mjs'];

// Run one file, echo its output and count its PASS/FAIL lines.
const runOne=f=>new Promise(res=>{
  const c=spawn(process.execPath,[join(here,f),...process.argv.slice(2)],{stdio:['ignore','pipe','inherit']});
  const r={f,pass:0,fail:0,code:null};let rest='';
  c.stdout.on('data',d=>{process.stdout.write(d);const lines=(rest+d).split('\n');rest=lines.pop();
    for(const l of lines){if(l.startsWith('PASS '))r.pass++;else if(l.startsWith('FAIL '))r.fail++;}});
  c.on('close',code=>{r.code=code;res(r);});
});

const results=[];
for(const f of files){console.log(`\n# ${f}`);results.push(await runOne(f));}
console.log('\n# summary');
for(const r of results) console.log(`${r.code||r.fail?'FAIL':'PASS'} ${r.f}: ${r.pass} passed, ${r.fail} failed`);
const pass=results.reduce((a,r)=>a+r.pass,0),fail=results.reduce((a,r)=>a+r.fail,0),bad=results.some(r=>r.code||r.fail);
console.log(`${pass+fail} checks: ${pass} passed, ${fail} failed`);
process.exitCode=bad?1:0;
