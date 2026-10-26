// Browser tests: drive own-shelf end to end in headless Chrome, in local mode ("this device only").
//   smoke.mjs       sign-in screen, local mode, rich paste, nested lists, highlights (in a block, across list
//                   items, in a footnote), Markdown upload, export in md/html/txt, reload, settings,
//                   backup and restore, ?add= deep link, service worker and offline reload
//   notebook.mjs    the Notebook: every highlight across books, chips, search, book filter, export, open at a highlight
//   search.mjs      search inside a book: accent folding, counts, the 200 cap, marking the match, Enter, Escape
//   notefilter.mjs  the "With note" chip in the highlights drawer
//   join.mjs        overlapping or touching highlights join into one, as on a Kindle: at either end, bridging two,
//                   across paragraphs, a recolour inside one, notes joined, Note, keys 1–5, the pull quote,
//                   "Joined N highlights · Undo", a sorted Coral highlight keeping its id (To sort, its fact card)
//   deletes.mjs     deletes that lose highlights or notes ask for "yes"
//   trash.mjs       the Trash: removed books, highlights and notes, restore, delete forever, the 30-day purge
//   undo.mjs        "Moved to Trash · Undo" after every delete: Undo per kind, the toast's lifetime, hover and focus,
//                   a second delete, Escape, none after Delete forever or Empty Trash
//   length.mjs      each book's length on the shelf: the cover's word count, the page block, the list's Length column
//   finish.mjs      finishing a book: real reading time needed, the cover's ✓ Finished, the manual override in Details
//   shelf.mjs       arranging the shelf by title (shelves and List view), picking a cover colour in Details
//   shelves.mjs     Arrange by Shelf: the starting shelves and Unsorted, chosen once; dragging covers between shelves
//                   with a mouse and a finger (hold, swipe, tap, the page scrolling at the edges), the Shelf picker in
//                   Details, new, rename, move and delete, search, the List view's Shelf column, a backup round trip;
//                   collapsing shelves (one, all, kept per device, dropping on a collapsed one); dragging a shelf by its name
//   kindle.mjs      Kindle notebook exports: review step, highlights and notes, merging, several files at once, the notebook cover
//   words.mjs       vocabulary: Word in the toolbar, the word card and its looked-up meaning (dictionaries mocked), the
//                   underline in the text, the Notebook's Words tab (search, book filter, open at the word), the Trash
//   wordbox.mjs     the word card and the note box stay inside the visible area with their buttons in view (a long or
//                   pasted meaning, the field dragged taller, a short window, an iPhone keyboard); dragging the word card
//   notesheet.mjs   on a phone, the note box as a sheet above the keyboard whose field grows with the note (a short
//                   and a long note, from the toolbar, a highlight and the drawer, an iPhone keyboard); a tap outside the
//                   note box or the word card saves it (the text, the bar, the scrim), Cancel drops, Escape saves,
//                   scrolling or selecting doesn't count, opening another note or the word card saves the open one
//   wordsheet.mjs   on a phone, the word card as a sheet above the keyboard: every field whole, the one being edited
//                   (antonyms, a long meaning, an example, a synonym, a section opened with Add) kept in view at its
//                   caret as it grows and the keyboard opens or pans; Save, a tap outside, Escape, Cancel; still a
//                   floating, draggable card with a mouse. Delete in the word card (the underline goes, Undo) and on the
//                   back of a Study card, a word and a fact card (the next card shows, Undo puts it back in the deck)
//   fastscroll.mjs  the fast-scroll handle under 1180 px: shown while scrolling, dragged by finger or mouse to any part
//                   with the section and percentage beside it, the position saved, none at 1280 px or for short texts
//   wordcard.mjs    the richer word card (lookups mocked): synonyms, antonyms, the dictionary's examples and Wikipedia's
//                   picture on saving, a title mismatch giving none, fact cards' pictures from their blank, pictures pasted,
//                   dropped or picked (3 at most, ×, the size guard), editing, meanings' line breaks, Study backs, older
//                   cards filled once when shown, saving offline
//   migrate.mjs     the artifact's "Back up shelf" (legacy/app-artifact.html) → the app's "Restore from backup"
//   study.mjs       Study flashcards: the queue (due first, the daily new-word cap), front and back, ratings and
//                   their saved schedule, Again, keys, Sentence → word, done and empty states, ?study=1
//   progress.mjs    the Words tab's Progress panel: its figures for cards with known schedules (due today, new left,
//                   learning, learned, total), the two-week chart of reviews coming up (the bars, today's count, hover
//                   and tap, folded on a phone and remembered), Study from the panel, compact at 320 px, light and dark;
//                   the study log: the last 30 days' reviews and the streak, written once when Study closes or the page
//                   hides (never per card), another device's days on opening the Notebook, in the backup
//   linkimport.mjs  link import's article extraction: a summary in the article's <header> survives Readability, and
//                   so does a short intro chunk in a bare <div> beside the article's other chunks
//   sort.mjs        To sort: Coral highlights (Kindle red and pink) become words (tap) or fact cards (a
//                   selected phrase as the blank), Skip and Show skipped, Make the rest facts, the sorting surviving
//                   a Kindle re-import, the Facts chip, the Trash, fact cards in Study
//   setup.mjs       a fork's Firebase setup errors name the setting to fix (Firebase SDK faked)
//   colours.mjs     colour meanings: five swatches and keys 1–5, renaming a meaning in Settings, grouping by colour
//                   in the Notebook, the drawer and the export, Kindle orange importing as amber (screenshots in out/colours/)
//   signin.mjs      Google sign-in with the Firebase SDK stubbed: popup or redirect, the iPhone home-screen app,
//                   the message for each failure, a redirect back without an account, local mode
//   dialogs.mjs     a tap outside a dialog starts and ends outside; outside or Escape saves Book details (quietly when
//                   nothing changed) and Settings, keeps the Add dialog's draft, cancels the rest; the date quick picks
//                   (Today, Yesterday, the native picker) and their sorting; the reader's heading opening Details on a phone
//   overflow.mjs    the page never scrolls sideways on a phone (375 and 320 px, touch): every screen, drawer, dialog
//                   and card, with unbroken links and titles, long words, a wide table and picture; the overflow-x:clip
//                   backstop, the window's scroll and Study's sticky buttons under it; text fields at 16 px or more
// Every file also fails on any page error.
//
// Run: `npm install` once, then `npm run test:browser`. One file: `node tests/browser/search.mjs`.
// Either takes an optional repo directory (default: this repo).
// Needs Google Chrome (set CHROME_PATH if it isn't at the macOS default), python3 (each file serves the repo
// with `python3 -m http.server` on its own port) and a network connection: fonts, the Firebase SDK and pdf.js
// load from CDNs.
// TEST_JOBS sets how many files run at once (default 4). Each of those workers keeps one Chrome for the files it
// runs, and each file gets a fresh browser context in it (lib.mjs). With TEST_JOBS=1 the files run in the order
// below and their output streams as it comes; with more, the longest files start first (by the last run's
// times, kept in out/times.json) and each file's output prints whole when it ends. The summary gives each
// file's time and the wall time.
// Fixtures are synthetic: legacy/test-fixture-rich-paste.html, tests/fixtures/kindle-notebook.html,
// tests/fixtures/article-header-summary.html, tests/fixtures/chunked-article-intro.html and Markdown written to a
// temp dir at run time.
// Screenshots go to tests/browser/out/ (gitignored).
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch,quit} from './lib.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const files=['smoke.mjs','notebook.mjs','search.mjs','notefilter.mjs','join.mjs','deletes.mjs','trash.mjs','undo.mjs','length.mjs','finish.mjs','shelf.mjs','shelves.mjs','kindle.mjs','words.mjs','wordbox.mjs','notesheet.mjs','wordsheet.mjs','fastscroll.mjs','wordcard.mjs','study.mjs','progress.mjs','sort.mjs','migrate.mjs','linkimport.mjs','setup.mjs','colours.mjs','signin.mjs','dialogs.mjs','overflow.mjs'];
const jobs=Math.max(1,Math.floor(Number(process.env.TEST_JOBS))||4),live=jobs===1;
const timesFile=join(here,'out','times.json');
let last={};try{last=JSON.parse(readFileSync(timesFile,'utf8'));}catch{}
const queue=live?[...files]:[...files].sort((a,b)=>(last[b]??1e9)-(last[a]??1e9)); // a new file counts as long

// Run one file in the given Chrome (none: the file launches its own) and count its PASS/FAIL lines. Live, its
// output goes straight through; otherwise it is kept for printing in one piece.
const runOne=(f,chrome)=>new Promise(res=>{
  const env=chrome?{...process.env,TEST_CHROME:chrome}:process.env;
  const c=spawn(process.execPath,[join(here,f),...process.argv.slice(2)],{stdio:['ignore','pipe',live?'inherit':'pipe'],env});
  const r={f,pass:0,fail:0,code:null,out:[]},t0=performance.now();let rest='';
  c.stdout.on('data',d=>{if(live)process.stdout.write(d);else r.out.push(d);
    const lines=(rest+d).split('\n');rest=lines.pop();
    for(const l of lines){if(l.startsWith('PASS '))r.pass++;else if(l.startsWith('FAIL '))r.fail++;}});
  if(!live) c.stderr.on('data',d=>r.out.push(d));
  c.on('close',code=>{r.code=code;r.s=(performance.now()-t0)/1000;res(r);});
});

// A worker takes files off the queue one at a time, all in one Chrome (a new one if it has died).
const results=new Map(),t0=performance.now();
async function worker(){
  let chrome=null;
  for(let f;(f=queue.shift());){
    if(!chrome?.connected){if(chrome) await quit(chrome).catch(()=>{});chrome=await launch().catch(()=>null);}
    if(live) console.log(`\n# ${f}`);
    const r=await runOne(f,chrome?.wsEndpoint());
    if(!live) process.stdout.write(`\n# ${f}\n${r.out.join('')}`);
    results.set(f,r);
  }
  if(chrome) await quit(chrome).catch(()=>{});
}
await Promise.all(Array.from({length:Math.min(jobs,files.length)},worker));

const all=files.map(f=>results.get(f)),wall=(performance.now()-t0)/1000,sum=all.reduce((a,r)=>a+r.s,0);
console.log('\n# summary');
for(const r of all) console.log(`${r.code||r.fail?'FAIL':'PASS'} ${r.f}: ${r.pass} passed, ${r.fail} failed (${r.s.toFixed(1)} s)`);
console.log(`${all.length} files in ${wall.toFixed(0)} s with TEST_JOBS=${jobs} (the files took ${sum.toFixed(0)} s together)`);
const pass=all.reduce((a,r)=>a+r.pass,0),fail=all.reduce((a,r)=>a+r.fail,0),bad=all.some(r=>r.code||r.fail);
console.log(`${pass+fail} checks: ${pass} passed, ${fail} failed`);
mkdirSync(dirname(timesFile),{recursive:true});writeFileSync(timesFile,JSON.stringify(Object.fromEntries(all.map(r=>[r.f,+r.s.toFixed(1)])),null,1)+'\n');
process.exitCode=bad?1:0;
