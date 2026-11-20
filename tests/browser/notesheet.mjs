// The note box on a phone, and a tap outside saving the note box and the word card.
// On a touch screen (a coarse pointer, as on an iPhone) at 390×844 and 375×667, with an iPhone keyboard faked
// (visualViewport shrunk, then panned): the note box is a full-width sheet above the keyboard whose field grows with
// the note, so a long one fills the visible area and a short one shows whole; Save and Cancel stay in view and the
// caret's line is visible; opened from the toolbar's Note, from a highlight tapped in the text and from the
// highlights drawer. Scrolling with it open, as WebKit moves the visible area over a keyboard (inside the layout
// viewport first, then the page): near the start, middle and end of the text the sheet comes back above the keyboard,
// and a long note scrolled to its start stays there as the visible area moves; with the keyboard down, Safari's
// toolbar changing the page's height; a long note opened on a fresh page shows its end. Then a tap outside (the text, the bar, the scrim) saves the note as Save does, a cleared one going
// to the Trash with Undo; Cancel drops it; Escape saves; scrolling, a press that selects text and a drag don't count;
// opening another note or the word card saves the open note first. The word card the same: a tap outside saves,
// Cancel drops, Escape saves. With a mouse, the note box still floats by the passage.
// Dictionaries are mocked (none has the word). Usage: node tests/browser/notesheet.mjs [repo dir]
// Screenshots (both sizes with a short and a long note above the keyboard, light and dark) go to tests/browser/out/notesheet/.
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
import {wordId} from '../../vocab.js';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('notesheet',8152);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','notesheet');mkdirSync(shots,{recursive:true});

await page.setBypassServiceWorker(true); // so every request reaches the interception below
await page.setRequestInterception(true);
page.on('request',req=>{
  const h=new URL(req.url()).hostname;
  if(h==='api.datamuse.com') return req.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'[]'});
  if(h==='en.wiktionary.org'||h==='en.wikipedia.org') return req.respond({status:404,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{}'});
  req.continue();
});

/* ---------- the book ---------- */
const filler=n=>('Filler words for the body of the text, read slowly. '.repeat(n)).trim();
const P1='The keeper wrote in his ledger every night, and the lanterns burned until the harbour was dark.';
const P2='Some days the sea was obdurate and grey, and the gulls kept away from the rocks by the mole.';
const BOOK=`# Sheet Test\n\nBy Lee Tester\n\n${filler(12)}\n\n## The harbour\n\n${P1}\n\n${filler(30)}\n\n## The mole\n\n${P2}\n\n${filler(30)}\n`;
const SHORT='A short note.';
const LONG=Array.from({length:24},(_,i)=>`Line ${i+1} of a long note about the passage.`).join('\n');

/* ---------- helpers ---------- */
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
const shown=sel=>until(s=>!document.querySelector(s).classList.contains('hidden'),sel);
const toastIs=s=>until(s=>document.querySelector('#toast').classList.contains('on')&&document.querySelector('#toast').textContent===s,s);
const toastOn=()=>page.$eval('#toast',e=>e.classList.contains('on'));
// no card open: Escape dismisses the toast (and closes any drawer)
const quiet=async()=>{await page.keyboard.press('Escape');await until(()=>!document.querySelector('#toast').classList.contains('on'));await t.drawersGone();};
// the local adapter's IndexedDB, read directly; the app doesn't wait for its writes, so poll
const idb=key=>page.evaluate(key=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,q=db.transaction('kv').objectStore('kv').get(key);q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}),key);
async function poll(key,fn){for(let i=0;i<40;i++){const v=await idb(key);if(v&&fn(v))return true;await sleep(100);}return false;}
let book;
// the highlight over `word`; its stored note; a word's stored meaning
const hlOf=word=>page.evaluate(w=>{const m=[...document.querySelectorAll('#col mark.hl')].find(m=>m.textContent.includes(w));return m&&m.dataset.h;},word);
const noteIs=async(word,note)=>{const id=await hlOf(word);return poll('state:'+book,s=>(s.hl||[]).some(h=>h.id===id&&(h.note||'')===note));};
const defIs=(term,def)=>poll('word:'+wordId(term),w=>(w.def||'')===def);
const noteText=()=>page.$eval('#noteTa',e=>e.value);
// Select `word` in the block that contains `inBlock`, scrolled 250 px from the top; wait for the toolbar.
async function select(inBlock,word){
  await page.evaluate((inBlock,word)=>{
    const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(inBlock));
    el.scrollIntoView({block:'center'});scrollBy(0,el.getBoundingClientRect().top-250);
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode())&&!n.data.includes(word));
    const i=n.data.indexOf(word),r=document.createRange();r.setStart(n,i);r.setEnd(n,i+word.length);getSelection().removeAllRanges();getSelection().addRange(r);
  },inBlock,word);
  return until(()=>!document.querySelector('#tool').classList.contains('hidden'));
}
const touch=()=>page.evaluate(()=>matchMedia('(pointer:coarse)').matches);
const tapAt=(x,y)=>touch().then(t=>t?page.touchscreen.tap(x,y):page.mouse.click(x,y));
const tap=sel=>touch().then(t=>t?page.tap(sel):page.click(sel));
// the middle of the first line box of the element matching sel (found by fn's text), scrolled to the middle
const middle=(sel,has)=>page.evaluate((sel,has)=>{const e=[...document.querySelectorAll(sel)].find(e=>e.textContent.includes(has));e.scrollIntoView({block:'center'});
  const r=e.getClientRects()[0];return {x:r.x+r.width/2,y:r.y+r.height/2};},sel,has);
const drawerOpen=()=>page.waitForFunction(()=>{const d=document.querySelector('#drawer');return d.classList.contains('open')&&!d.getAnimations().length;});
// The three ways to a note: the toolbar's Note on a selection, a highlight tapped in the text, the highlights drawer
// (opened first unless it is open).
async function openNote(how,word){
  if(how==='toolbar'){await select(P1,word);await tap('#tool [data-a="note"]');}
  else if(how==='mark'){
    const at=await middle('#col mark.hl',word);await sleep(50);
    await tapAt(at.x,at.y);await until(()=>!!document.querySelector('#tool:not(.hidden) [data-a="note"]'));await tap('#tool [data-a="note"]');
  }else{
    if(!(await page.$eval('#drawer',d=>d.classList.contains('open')))){await tap('#bHl');await drawerOpen();}
    await tap(`#drList .hcard[data-id="${await hlOf(word)}"] [data-a="note"]`);
  }
  await shown('#noteBox');await until(()=>document.activeElement===document.querySelector('#noteTa'));
}
// Type at the end of the note, as a keyboard would (an input event per insertion); clear it.
const caretAt=start=>page.$eval('#noteTa',(e,start)=>{e.focus();const r=document.createRange();r.selectNodeContents(e);r.collapse(start);getSelection().removeAllRanges();getSelection().addRange(r);},start);
async function typeAtEnd(s){await caretAt(false);const ls=s.split('\n');for(let i=0;i<ls.length;i++){if(i) await page.keyboard.press('Enter');if(ls[i]) await page.keyboard.sendCharacter(ls[i]);}}
async function clearNote(){await page.$eval('#noteTa',e=>{e.focus();getSelection().selectAllChildren(e);});await page.keyboard.press('Backspace');}
// An iPhone keyboard: the page keeps its full height, visualViewport shrinks to `h` and may be panned down by `top`.
const iosKeyboard=(h,top=0)=>page.evaluate((h,top)=>{const v=visualViewport;
  if(h==null){delete v.height;delete v.offsetTop;}
  else{window.__kb={h,top};Object.defineProperty(v,'height',{configurable:true,get:()=>__kb.h});Object.defineProperty(v,'offsetTop',{configurable:true,get:()=>__kb.top});}
  v.dispatchEvent(new Event('resize'));},h,top);
// A finger scrolling the page by dy px (toward the start: dy < 0) with that keyboard up, as WebKit does it: the visible
// area first slides inside the full-height layout viewport, which position:fixed boxes keep to (offsetTop), and only
// then pushes it along (scrollY); then visualViewport's scroll event. Scrolling up from a panned visible area carries
// the sheet down behind the keyboard until that event comes.
const iosScroll=dy=>page.evaluate(dy=>{const top=Math.max(0,Math.min(innerHeight-__kb.h,__kb.top+dy));
  scrollBy(0,dy-(top-__kb.top));__kb.top=top;visualViewport.dispatchEvent(new Event('scroll'));},dy);
const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
// The note box in the visible area: inside it, its buttons in view and on top, its width, the room left above and below
// it, whether the field shows the whole note, and whether the field's end or start (the caret's line) is in view.
const sheet=()=>page.evaluate(()=>{
  const v=visualViewport,top=v.offsetTop,bottom=v.offsetTop+v.height;
  const inside=r=>r.top>=top-.5&&r.bottom<=bottom+.5&&r.left>=-.5&&r.right<=v.width+.5;
  const b=document.querySelector('#noteBox').getBoundingClientRect(),ta=document.querySelector('#noteTa'),f=ta.getBoundingClientRect();
  const btn=s=>{const r=document.querySelector(s).getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return inside(r)&&!!hit&&!!hit.closest(s);};
  return {inside:inside(b),buttons:btn('#noteSave')&&btn('#noteCancel'),width:Math.round(b.width),vw:Math.round(v.width),above:Math.round(b.top-top),below:Math.round(bottom-b.bottom),
    full:b.height>=v.height-.5&&b.width>=v.width-.5,whole:ta.scrollHeight<=ta.clientHeight+2,end:inside(f)&&ta.scrollTop+ta.clientHeight>=ta.scrollHeight-2,start:inside(f)&&ta.scrollTop<20};
});
// A point on plain text in the article, high on the screen: not on a highlight, a saved word, the toolbar or a card.
const textPoint=()=>page.evaluate(()=>{
  for(const p of document.querySelectorAll('#col p.hp')){const r=p.getBoundingClientRect();
    for(let y=Math.max(r.top+8,100);y<Math.min(r.bottom,innerHeight*.35);y+=12){const x=r.left+40;if(document.elementFromPoint(x,y)===p) return {x,y};}}
  return null;});
async function tapText(){const p=await textPoint();must('a plain text point on screen',!!p);await tapAt(p.x,p.y);}
// A finger dragged 150 px down the text, as when scrolling.
async function swipe(){const p=await textPoint();must('a plain text point on screen',!!p);
  await page.touchscreen.touchStart(p.x,p.y);for(let i=1;i<=6;i++) await page.touchscreen.touchMove(p.x,p.y+i*25);await page.touchscreen.touchEnd();await sleep(100);}
const shot=async label=>{await sleep(150);await page.screenshot({path:join(shots,label+'.png')});};
const phone=async(width,height)=>{await page.setViewport({width,height,deviceScaleFactor:2,hasTouch:true,isMobile:true});await page.reload();await t.reader();};

await t.run(async()=>{
  // a phone: touch from the first load, so the app sees a coarse pointer
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,hasTouch:true,isMobile:true});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await enterLocalMode(t,must);
  await addMarkdown(t,'sheet-test.md',BOOK,'Sheet Test');
  book=await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:last')));
  must('the app sees a touch screen',await touch());

  /* ---------- 1. the note box on a phone, a short and a long note, from the toolbar, a highlight and the drawer ---------- */
  for(const [vw,vh,kb] of [[390,844,460],[375,667,363]]){
    const size=`${vw}×${vh}`;
    if(vw!==390) await phone(vw,vh);
    for(const [how,note] of [['toolbar',SHORT],['mark',LONG],['drawer',LONG]]){
      const long=note===LONG,at=`${size}, from the ${how}`;
      await openNote(how,'ledger');await clearNote();await typeAtEnd(note);await sleep(50);
      let s=await sheet();
      ok(`${at}: the note box is a full-screen sheet, Done and Cancel in view`,s.inside&&s.buttons&&s.full&&s.width>=s.vw-24);
      ok(long?`${at}: a long note shows whole or fills the screen, the caret's line in view`:`${at}: a short note shows whole, the text in view above it`,
        s.end&&(long?s.whole||s.above<=24:s.whole&&s.full));
      await iosKeyboard(kb);await sleep(50);s=await sheet();
      ok(`${at}: above an iPhone keyboard, the sheet and its buttons are in view`,s.inside&&s.buttons&&s.below<=24);
      ok(long?`${at}: there, a long note fills the space above the keyboard, the caret's line in view`:`${at}: there, a short note shows whole`,
        s.end&&(long?s.above<=24:s.whole&&s.full));
      await shot(`${vw}-${how}-${long?'long':'short'}-keyboard`);
      await typeAtEnd(' More.');s=await sheet();
      ok(`${at}: typing at the end keeps the caret's line in view`,s.end&&s.inside&&s.buttons);
      if(long){
        await caretAt(true);await page.keyboard.sendCharacter('X');s=await sheet();
        ok(`${at}: typing at the start shows the start`,s.start);
        await page.keyboard.press('Backspace');
      }
      await iosKeyboard(kb,vh-kb);await sleep(50);s=await sheet();
      ok(`${at}: with the visible area panned down, the sheet follows it`,s.inside&&s.buttons&&s.below<=24&&(!long||s.above<=24));
      await iosKeyboard(null);await sleep(50);
      await tap(how==='toolbar'?'#noteSave':'#noteCancel');await hidden('#noteBox');
      await quiet();
    }
    ok(`${size}: Save saved the short note, Cancel dropped the long ones`,await noteIs('ledger',SHORT+' More.'));
  }
  // light and dark at both sizes, a long note above the keyboard
  for(const [vw,vh,kb] of [[375,667,363],[390,844,460]]){
    if(vw!==375) await phone(vw,vh);
    for(const dark of [false,true]){
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);
      await openNote('mark','ledger');await typeAtEnd('\n'+LONG);await iosKeyboard(kb);await sleep(50);
      await shot(`${vw}-long-${dark?'dark':'light'}`);await iosKeyboard(null);await tap('#noteCancel');await hidden('#noteBox');
    }
  }
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);

  /* ---------- 1b. scrolling with the sheet open: the page with the keyboard up or down, and the note itself ---------- */
  // iOS pans the visible area down to the field as the keyboard opens; scrolling toward the start then slides it up
  // inside the layout viewport before the page moves, and toward the end the other way. Near the start, in the middle
  // and near the end of the text, a long note.
  for(const where of ['start','middle','end']){
    if(where==='middle') await openNote('mark','ledger');
    else{await page.evaluate(w=>scrollTo(0,w==='start'?0:document.documentElement.scrollHeight),where);await openNote('drawer','ledger');}
    await typeAtEnd('\n'+LONG);await iosKeyboard(460,844-460);
    let fine=true;
    for(const dy of [-150,-150,-150,-150,300,300,300]){await iosScroll(dy);const s=await sheet();fine=fine&&s.inside&&s.buttons&&s.below<=24&&s.above<=24&&s.end;}
    ok(`near the ${where} of the text: scrolling up and down with the keyboard up, the sheet comes back above it, the caret's line in view`,fine);
    // scrolled up inside the field to read its start, the caret still at the end, then the visible area moves
    await page.$eval('#noteTa',e=>{e.scrollTop=0;});await iosScroll(-150);let s=await sheet();
    ok(`near the ${where} of the text: a long note scrolled to its start stays there as the visible area moves`,s.start&&s.inside&&s.buttons);
    await iosKeyboard(460);s=await sheet();
    ok(`near the ${where} of the text: and as the keyboard's height changes`,s.start&&s.inside&&s.buttons);
    await iosKeyboard(null);await tap('#noteCancel');await hidden('#noteBox');await quiet();
  }
  // keyboard down, in Safari: scrolling up brings its toolbar back, and the page's height shrinks under the sheet
  {
    await openNote('mark','ledger');await typeAtEnd('\n'+LONG);
    await page.setViewport({width:390,height:760,deviceScaleFactor:2,hasTouch:true,isMobile:true});await frames();let s=await sheet();
    ok('keyboard down, Safari’s toolbar back: the sheet of a long note still fits the screen, the caret’s line in view',s.inside&&s.buttons&&s.below<=24&&s.end&&(s.whole||s.above<=24));
    await page.setViewport({width:390,height:844,deviceScaleFactor:2,hasTouch:true,isMobile:true});await frames();s=await sheet();
    ok('and with the toolbar gone again, it still fits the taller screen',s.inside&&s.buttons&&s.below<=24&&s.end&&(s.whole||s.above<=24));
    await tap('#noteCancel');await hidden('#noteBox');
    ok('Cancel dropped every long note',await noteIs('ledger',SHORT+' More.'));
  }
  // a note longer than the screen, saved, then opened on a fresh page: its end shows, where the caret is, and still
  // does once the keyboard is up and iOS has panned to it
  {
    await openNote('mark','ledger');await typeAtEnd('\n'+LONG+'\n'+LONG);await tap('#noteSave');await hidden('#noteBox');
    {const got=await noteIs('ledger',`${SHORT} More.\n${LONG}\n${LONG}`);if(!got) console.log('GOT',JSON.stringify((await idb('state:'+book)).hl.map(h=>h.note)).slice(0,300));must('the long note is saved',got);}await quiet();
    await phone(390,844);await openNote('mark','ledger');let s=await sheet();
    ok('a note longer than the screen, opened on a fresh page, shows its end, where the caret is',s.end&&!s.whole&&s.inside&&s.buttons);
    await iosKeyboard(460,844-460);s=await sheet();
    ok('and still does once the keyboard is up and iOS has panned to it',s.end&&s.inside&&s.buttons&&s.above<=24);
    await iosKeyboard(null);await tap('#noteCancel');await hidden('#noteBox');
  }

  // full screen: the passage quoted at the top, the editor under it, the bar (B I U, Done) at the bottom
  await openNote('mark','ledger');
  {const g=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect(),q=r('#noteQuote'),e=r('#noteTa'),f=r('#noteBox .row'),b=r('#noteBox');
    return {q:document.querySelector('#noteQuote').textContent,full:b.width>=innerWidth-1&&b.height>=innerHeight-1,order:q.bottom<=e.top+1&&e.bottom<=f.top+1,bar:['#noteB','#noteI','#noteU','#noteSave'].every(s=>r(s).bottom<=b.bottom)};});
   ok('at 390×844 with touch the note opens full screen, the passage quoted above the editor, the bar below it',g.full&&g.order&&g.bar&&g.q.includes('ledger'));}
  await tap('#noteCancel');await hidden('#noteBox');await quiet();

  /* ---------- 2. a tap outside the note box saves it ---------- */
  await select(P2,'gulls');await tap('#tool [data-c="sky"]');await until(()=>document.querySelector('#hlCount').textContent==='2');
  await openNote('mark','ledger');await clearNote();await typeAtEnd('Saved by a tap.');
  await tap('#noteSave');
  ok('(full screen: nothing is outside it) Done saves the note and closes the box',await hidden('#noteBox')&&await noteIs('ledger','Saved by a tap.')&&await toastIs('Note saved'));
  await quiet();
  await openNote('mark','ledger');await typeAtEnd(' And the bar.');
  await tap('#noteSave');
  ok('Done saves again',await hidden('#noteBox')&&await noteIs('ledger','Saved by a tap. And the bar.'));
  await quiet();
  await openNote('mark','ledger');await typeAtEnd(' Dropped.');await tap('#noteCancel');
  ok('Cancel drops what was typed',await hidden('#noteBox')&&await noteIs('ledger','Saved by a tap. And the bar.'));
  await openNote('mark','ledger');await typeAtEnd(' Escaped.');await page.keyboard.press('Escape');
  ok('Escape saves',await hidden('#noteBox')&&await noteIs('ledger','Saved by a tap. And the bar. Escaped.'));
  await quiet();
  await openNote('mark','ledger');await tap('#noteSave');
  ok('Done with nothing changed closes the box without a toast',await hidden('#noteBox')&&!(await toastOn()));
  // (a finger on the text or a long press there can't reach it: the sheet covers the screen; section 4 keeps those for a mouse)
  await openNote('mark','ledger');await typeAtEnd(' Kept.');await page.keyboard.press('Escape');await hidden('#noteBox');await quiet();
  // over the drawer: another highlight's Edit note saves the open note first
  await openNote('drawer','ledger');await typeAtEnd(' Over the drawer.');
  await openNote('drawer','gulls');
  ok('opening another highlight’s note saves the open one first',await noteIs('ledger','Saved by a tap. And the bar. Escaped. Kept. Over the drawer.')&&(await noteText())==='');
  await typeAtEnd('Gulls.');await page.keyboard.press('Escape');
  ok('Escape over the drawer saves that one',await hidden('#noteBox')&&await noteIs('gulls','Gulls.'));
  await quiet();
  await openNote('mark','gulls');await clearNote();await tap('#noteSave');
  ok('a note cleared and tapped away goes to the Trash with Undo',await hidden('#noteBox')&&await toastIs('Moved to Trash · Undo')&&await noteIs('gulls',''));
  await quiet();

  /* ---------- 3. the word card ---------- */
  ok('the word card’s buttons are Cancel and Save',(await text('#wbClose'))==='Cancel'&&(await text('#wbSave'))==='Save');
  await select(P2,'obdurate');await tap('#tool [data-a="word"]');await shown('#wordBox');
  await until(()=>document.querySelector('#wbDef').placeholder.startsWith('No meaning'));
  await page.focus('#wbDef');await page.keyboard.sendCharacter('Stubborn.');
  await tapText();
  ok('a tap outside the word card saves the meaning and closes it',await hidden('#wordBox')&&await defIs('obdurate','Stubborn.')&&await toastIs('Meaning saved'));
  await quiet();
  const openCard=async()=>{const at=await middle(`.wd[data-w="${wordId('obdurate')}"]`,'obdurate');await sleep(50);await tapAt(at.x,at.y);await shown('#wordBox');};
  await openCard();await page.focus('#wbDef');await page.keyboard.sendCharacter(' Dropped.');await tap('#wbClose');
  ok('Cancel drops the typed meaning',await hidden('#wordBox')&&await defIs('obdurate','Stubborn.'));
  await openCard();await page.focus('#wbDef');await page.keyboard.sendCharacter(' Unyielding.');
  await swipe();
  ok('scrolling leaves the word card open',await vis('#wordBox'));
  await page.keyboard.press('Escape');
  ok('Escape saves the word card',await hidden('#wordBox')&&await defIs('obdurate','Stubborn. Unyielding.'));
  await quiet();
  await openNote('mark','ledger');await typeAtEnd(' Then a word.');await page.keyboard.press('Escape');await hidden('#noteBox');await openCard();
  ok('Escape saved the note, then the word card opens',await hidden('#noteBox')&&await noteIs('ledger','Saved by a tap. And the bar. Escaped. Kept. Over the drawer. Then a word.'));
  await tap('#wbClose');await hidden('#wordBox');await quiet();

  /* ---------- 4. with a mouse: the note box floats, a click outside or on the scrim saves, a drag-select doesn't ---------- */
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});await page.reload();await t.reader();
  must('with a mouse, the pointer is fine',!(await touch()));
  await openNote('mark','ledger');const s=await sheet();
  const wh=await page.evaluate(()=>innerHeight),pb=await page.$eval('#noteBox',e=>{const r=e.getBoundingClientRect();return {h:r.height,w:r.width,l:r.left};});
  ok('with a mouse, the note box is a tall panel beside the text (about 440 px wide, most of the window)',s.inside&&s.buttons&&pb.w>=420&&pb.w<=460&&pb.h>=wh*.8&&!s.full&&pb.l>=640);
  await typeAtEnd(' Desktop.');
  const q=await textPoint();
  await page.mouse.move(q.x,q.y);await page.mouse.down();await page.mouse.move(q.x+120,q.y+30,{steps:6});await page.mouse.up();await sleep(100);
  ok('selecting text with the mouse leaves the note box open',await vis('#noteBox'));
  await page.evaluate(()=>getSelection().removeAllRanges());
  await tapText();
  ok('a click outside saves the note',await hidden('#noteBox')&&await noteIs('ledger','Saved by a tap. And the bar. Escaped. Kept. Over the drawer. Then a word. Desktop.'));
  await quiet();
  await openNote('drawer','gulls');await typeAtEnd('By the scrim.');
  await page.mouse.click(200,450);
  ok('a click on the scrim saves the note',await hidden('#noteBox')&&await noteIs('gulls','By the scrim.'));
  await quiet();
  await openNote('drawer','gulls');await typeAtEnd(' Keys.');
  await page.focus(`#drList .hcard[data-id="${await hlOf('ledger')}"] [data-a="note"]`);await page.keyboard.press('Enter');
  ok('Enter on another highlight’s Edit note saves the open one first',await noteIs('gulls','By the scrim. Keys.')&&(await noteText()).endsWith('Desktop.'));
  await page.click('#noteCancel');await hidden('#noteBox');

  /* ---------- 5. B, I and U in the editor (a mouse) ---------- */
  await openNote('mark','ledger');await clearNote();
  const press=id=>page.click(id);
  await press('#noteB');await page.keyboard.sendCharacter('bold');
  ok('B turns bold on at the caret: the editor holds <b>',await page.$eval('#noteTa',e=>!!e.querySelector('b,strong')&&document.querySelector('#noteB').getAttribute('aria-pressed')==='true'));
  await press('#noteB');await page.keyboard.sendCharacter(' plain ');
  ok('B again turns it off: the button is no longer pressed',await page.$eval('#noteB',e=>e.getAttribute('aria-pressed')==='false'));
  await press('#noteI');await page.keyboard.sendCharacter('ital');await press('#noteI');
  await press('#noteU');await page.keyboard.sendCharacter('under');await press('#noteU');
  ok('I and U make <i> and <u>, the editor keeping focus',await page.$eval('#noteTa',e=>!!e.querySelector('i,em')&&!!e.querySelector('u')&&document.activeElement===e));
  await page.keyboard.down('Meta');await page.keyboard.press('KeyB');await page.keyboard.up('Meta');await page.keyboard.sendCharacter('keys');
  ok('⌘B toggles bold too',await page.$eval('#noteTa',e=>[...e.querySelectorAll('b,strong')].some(b=>b.textContent.includes('keys'))));
  const conv=await page.evaluate(()=>document.querySelector('#noteTa').value);
  const real=await page.evaluate(()=>!!globalThis.editorToNote);
  await page.evaluate(()=>{const dt=new DataTransfer();dt.setData('text/plain','PASTED');dt.setData('text/html','<span style="color:red">x</span>');document.querySelector('#noteTa').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));});
  ok('paste inserts plain text only',await page.$eval('#noteTa',e=>e.textContent.includes('PASTED')&&!e.querySelector('[style]')));
  await press('#noteSave');await hidden('#noteBox');
  ok(`the saved note holds the text${real?' and its marks':' (plain, the fallback converter)'}`,await poll('state:'+book,st=>(st.hl||[]).some(h=>{const n=h.note||'';return n.includes('bold')&&n.includes('ital')&&n.includes('under')&&(!real||(n.includes('**bold**')&&/_ital_|\*ital\*/.test(n)));})));
  must('converter returned something for the saved note',conv.includes('bold'));
});
