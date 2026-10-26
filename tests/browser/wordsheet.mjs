// The word card on a phone, and deleting a word from the word card and from Study.
// On a touch screen (a coarse pointer, as on an iPhone) at 390×844 and 375×667, with an iPhone keyboard faked
// (visualViewport shrunk, then panned): the word card is a full-width sheet above the keyboard, its head (with Delete),
// Save and Cancel always in view. A word with a long meaning, examples, synonyms, antonyms and a picture shows every
// field whole; editing its antonyms (the case reported from an iPhone) keeps them in view at the caret as the keyboard
// opens, as they grow and as the visible area pans. A long meaning fills the sheet and scrolls inside itself; an example
// and a synonym grow as they're typed; a section opened with Add is in view above the keyboard. Save, a tap outside and
// Escape save; Cancel drops. With a mouse on a wide screen the card still floats and drags, and pressing its Delete
// doesn't drag it. Then Delete: in the reader's word card (its underline goes, and "Moved to Trash · Undo" brings both
// back) and on the back of a Study card, a word and a fact card (none on the front; the next card shows; Undo puts it
// back next in the deck, after the last card too; the Trash and the Words tab follow), far from Save and the ratings.
// Dictionaries and Wikipedia are mocked. Usage: node tests/browser/wordsheet.mjs [repo dir]
// Screenshots (both sizes editing the antonyms above the keyboard, light and dark; Study's back with Delete, phone and
// desktop) go to tests/browser/out/wordsheet/.
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
import {wordId,factId} from '../../vocab.js';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('wordsheet',8157);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','wordsheet');mkdirSync(shots,{recursive:true});

/* ---------- the dictionaries and Wikipedia, mocked: "obdurate" has everything, "lanterns" only a meaning ---------- */
const DEF='Unreasonably stubborn, refusing to change one’s opinion or course of action, especially when others plead or argue; hard of heart; resistant to persuasion, softening or pity.';
const SYN=['stubborn','unyielding','obstinate','intransigent','inflexible','adamant'],ANT=['yielding','compliant','tractable','amenable','flexible','docile'];
const WIKT=`==English==\n===Adjective===\n# Stubborn.\n#: {{ux|en|The '''obdurate''' keeper refused to leave the lighthouse when the storm came in.}}\n#* {{quote-book|en|year=1901|author=Sam Writer|title=Sea Days|passage=He was '''obdurate''' in the face of every plea his family could think of.}}`;
const PNG=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=330;c.height=300;const x=c.getContext('2d');x.fillStyle='#2F5A43';x.fillRect(0,0,330,300);return c.toDataURL('image/png').split(',')[1];});
const json=(req,status,body)=>req.respond({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
await page.setBypassServiceWorker(true); // so every request reaches the interception below
await page.setRequestInterception(true);
page.on('request',req=>{
  const u=new URL(req.url()),q=u.searchParams,h=u.hostname;
  if(h==='api.datamuse.com'){
    if(q.has('sp')) return json(req,200,q.get('sp')==='obdurate'?[{word:'obdurate',defs:['adj\t'+DEF]}]:/^lantern/.test(q.get('sp'))?[{word:'lantern',defs:['n\tA lamp in a case.']}]:[]);
    const syn=q.has('rel_syn'),w=q.get(syn?'rel_syn':'rel_ant');
    return json(req,200,(w==='obdurate'?syn?SYN:ANT:[]).map((word,i)=>({word,score:100-i})));
  }
  if(h==='en.wiktionary.org') return json(req,200,q.get('page')==='obdurate'?{parse:{title:'obdurate',pageid:1,wikitext:WIKT}}:{error:{code:'missingtitle'}});
  if(h==='en.wikipedia.org') return /obdurate/i.test(u.pathname)?json(req,200,{type:'standard',title:'Obdurate',thumbnail:{source:'https://thumb.wikimedia.org/t/330px-Obdurate.png',width:330,height:300},content_urls:{desktop:{page:'https://en.wikipedia.org/wiki/Obdurate'}}}):json(req,404,{});
  if(h==='thumb.wikimedia.org') return req.respond({status:200,contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:Buffer.from(PNG,'base64')});
  req.continue();
});

/* ---------- the book ---------- */
const filler=n=>('Filler words for the body of the text, read slowly. '.repeat(n)).trim();
const P1='The keeper wrote in his ledger every night, and the lanterns burned until the harbour was dark.';
const P2='Some days the sea was obdurate and grey, and the gulls kept away from the rocks by the mole.';
const BOOK=`# Sheet Words\n\nBy Lee Tester\n\n${filler(12)}\n\n${P1}\n\n${filler(20)}\n\n${P2}\n\n${filler(30)}\n`;
const LONG=Array.from({length:30},(_,i)=>`Line ${i+1} of a meaning written by hand.`).join('\n');
const OBD=wordId('obdurate'),LAN=wordId('lanterns');

/* ---------- helpers ---------- */
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
const shown=sel=>until(s=>!document.querySelector(s).classList.contains('hidden'),sel);
const toastIs=s=>until(s=>document.querySelector('#toast').classList.contains('on')&&document.querySelector('#toast').textContent===s,s);
// no card open: Escape dismisses the toast; one open: wait for the toast to go
const quiet=async()=>{await page.keyboard.press('Escape');await until(()=>!document.querySelector('#toast').classList.contains('on'));};
const toastGone=()=>until(()=>!document.querySelector('#toast').classList.contains('on'));
const settled=()=>page.waitForFunction(()=>!document.querySelector('#toast').getAnimations().length);
// the local adapter's IndexedDB, read and written directly; the app doesn't wait for its writes, so poll
const idb=key=>page.evaluate(key=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,s=db.transaction('kv').objectStore('kv'),q=key==='keys'?s.getAllKeys():s.get(key);q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}),key);
async function poll(key,fn){for(let i=0;i<50;i++){const v=await idb(key);if(fn(v))return true;await sleep(100);}return false;}
const word=(id,fn)=>poll('word:'+id,w=>!!w&&fn(w));
const gone=id=>poll('word:'+id,w=>!w);
const trashed=async()=>{const keys=(await idb('keys')).filter(k=>k.startsWith('trash:'));return Promise.all(keys.map(idb));};
async function trashHas(fn){for(let i=0;i<50;i++){const l=await trashed();if(fn(l))return true;await sleep(100);}return false;}
const seed=(words,clear)=>page.evaluate((words,clear)=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite'),s=tx.objectStore('kv');if(clear) s.delete(IDBKeyRange.bound('word:','word:￿'));
    words.forEach(w=>s.put(w,'word:'+w.id));tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};}),words,clear);
const touch=()=>page.evaluate(()=>matchMedia('(pointer:coarse)').matches);
const tapAt=(x,y)=>touch().then(t=>t?page.touchscreen.tap(x,y):page.mouse.click(x,y));
const tap=sel=>touch().then(t=>t?page.tap(sel):page.click(sel));
const underlines=id=>page.$$eval(`#col .wd[data-w="${id}"]`,e=>e.length);
// Select `word` in the block that holds `inBlock`, scrolled 250 px from the top, then tap Word.
async function saveWord(inBlock,w){
  await page.evaluate((inBlock,w)=>{
    const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(inBlock));el.scrollIntoView({block:'center'});scrollBy(0,el.getBoundingClientRect().top-250);
    const tw=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=tw.nextNode())&&!n.data.includes(w));
    const i=n.data.indexOf(w),r=document.createRange();r.setStart(n,i);r.setEnd(n,i+w.length);getSelection().removeAllRanges();getSelection().addRange(r);
  },inBlock,w);
  must('the toolbar offers Word',await until(()=>!!document.querySelector('#tool:not(.hidden) [data-a="word"]')));
  await tap('#tool [data-a="word"]');await shown('#wordBox');
}
// Tap a saved word's underline, scrolled 250 px from the top.
async function openCard(id){
  const at=await page.evaluate(id=>{const u=document.querySelector(`#col .wd[data-w="${id}"]`);u.scrollIntoView({block:'center'});scrollBy(0,u.getBoundingClientRect().top-250);
    const b=u.getClientRects()[0];return {x:b.x+b.width/2,y:b.y+b.height/2};},id);
  await sleep(50);await tapAt(at.x,at.y);await shown('#wordBox');
}
const filled=()=>until(()=>!document.querySelector('#wordBox [data-x="ant"]').classList.contains('hidden')&&document.querySelectorAll('#wordBox [data-x="pics"] img').length===1&&document.querySelector('#wbDef').value);
// Tap a field of the card (scrolled into the card's view first), then put the caret at its end.
async function editField(sel){
  const at=await page.$eval(sel,e=>{e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+12,y:r.top+Math.min(10,r.height/2)};});
  await tapAt(at.x,at.y);
  await page.$eval(sel,e=>{e.focus();if(e.setSelectionRange){e.setSelectionRange(e.value.length,e.value.length);return;}
    const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let n,last=null;while((n=w.nextNode())) last=n; // in its last text, as a tap puts it
    const r=document.createRange();if(last) r.setStart(last,last.length);else r.selectNodeContents(e);r.collapse(!!last);getSelection().removeAllRanges();getSelection().addRange(r);});
  await sleep(50);
}
const ANT_F='#wordBox [data-x="ant"] .wx-f',SYN_F='#wordBox [data-x="syn"] .wx-f',DEX_F='#wordBox [data-x="dex"] .wx-f';
// An iPhone keyboard: the page keeps its full height, visualViewport shrinks to `h` and may be panned down by `top`.
const iosKeyboard=async(h,top=0)=>{await page.evaluate((h,top)=>{const v=visualViewport;
  if(h==null){delete v.height;delete v.offsetTop;}
  else{Object.defineProperty(v,'height',{configurable:true,get:()=>h});Object.defineProperty(v,'offsetTop',{configurable:true,get:()=>top});}
  v.dispatchEvent(new Event('resize'));},h,top);await sleep(50);};
// The word card in the visible area: a sheet, inside, its width; Save, Cancel and Delete in view and on top; every
// field showing its text whole; the field being edited whole inside the card's scrolling middle and the visible area,
// with its caret there; the meaning's size against that middle's, and whether it scrolls, at its end or start.
const card=()=>page.evaluate(()=>{
  const v=visualViewport,top=v.offsetTop,bottom=v.offsetTop+v.height;
  const inside=r=>r.top>=top-.5&&r.bottom<=bottom+.5&&r.left>=-.5&&r.right<=v.width+.5;
  const box=document.querySelector('#wordBox'),b=box.getBoundingClientRect(),body=document.querySelector('#wbBody'),B=body.getBoundingClientRect();
  const inBody=r=>!!r&&r.top>=B.top-.5&&r.bottom<=B.bottom+.5&&inside(r);
  const onTop=s=>{const r=document.querySelector(s).getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return inside(r)&&!!hit&&!!hit.closest(s);};
  const fields=[...box.querySelectorAll('#wbDef,[data-x] .wx-f')].filter(e=>!e.closest('.hidden'));
  const f=document.activeElement,edit=f&&body.contains(f)&&f.isContentEditable?f:null,s=getSelection();
  let caret=null;if(edit&&s.rangeCount){const c=s.getRangeAt(0).cloneRange();c.collapse(false);caret=c.getClientRects()[0]||null;} // none in an empty field
  const ta=document.querySelector('#wbDef'),tr=ta.getBoundingClientRect();
  return {sheet:box.classList.contains('sheet'),inside:inside(b),width:Math.round(b.width),vw:Math.round(v.width),top:Math.round(b.top),left:Math.round(b.left),
    below:Math.round(bottom-b.bottom),buttons:onTop('#wbSave')&&onTop('#wbClose')&&onTop('#wbDel'),whole:fields.every(e=>e.scrollHeight<=e.clientHeight+2),
    edit:edit?{h:Math.round(edit.getBoundingClientRect().height),whole:inBody(edit.getBoundingClientRect()),caret:caret?inBody(caret):!edit.textContent}:null,
    ta:{h:Math.round(tr.height),room:Math.round(B.height),inBody:inBody(tr),scrolls:ta.scrollHeight>ta.clientHeight+2,end:ta.scrollTop+ta.clientHeight>=ta.scrollHeight-2,start:ta.scrollTop<20}};
});
const editing=c=>!!c.edit&&c.edit.whole&&c.edit.caret;
// A point on plain text in the article, high on the screen: not on a highlight, a saved word, the toolbar or a card.
const textPoint=()=>page.evaluate(()=>{
  for(const p of document.querySelectorAll('#col p.hp')){const r=p.getBoundingClientRect();
    for(let y=Math.max(r.top+8,100);y<Math.min(r.bottom,innerHeight*.35);y+=12){const x=r.left+40;if(document.elementFromPoint(x,y)===p) return {x,y};}}
  return null;});
const shot=async label=>{await sleep(150);await page.screenshot({path:join(shots,label+'.png')});};
const phone=async(width,height)=>{await page.setViewport({width,height,deviceScaleFactor:2,hasTouch:true,isMobile:true});await page.reload();await t.reader();};

await t.run(async()=>{
  // a phone: touch from the first load, so the app sees a coarse pointer
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,hasTouch:true,isMobile:true});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await enterLocalMode(t,must);
  await addMarkdown(t,'sheet-words.md',BOOK,'Sheet Words');
  const book=await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:last')));
  must('the app sees a touch screen',await touch());

  /* ---------- 1. a full word card as a sheet; its antonyms edited above the keyboard ---------- */
  let typed=ANT.join(', ');
  for(const [vw,vh,kb] of [[390,844,460],[375,667,363]]){
    const size=`${vw}×${vh}`;
    if(vw===390) await saveWord(P2,'obdurate'); else{await phone(vw,vh);await openCard(OBD);}
    must('the card is filled: meaning, examples, synonyms, antonyms, a picture',await filled());await toastGone();await sleep(200);
    let c=await card();
    ok(`${size}: the word card is a full-width sheet inside the screen, Save, Cancel and Delete in view`,c.sheet&&c.inside&&c.buttons&&c.width>=c.vw-24);
    ok(`${size}: every field shows its text whole: the meaning, examples, synonyms and antonyms`,c.whole&&!c.ta.scrolls);
    await editField(ANT_F);await iosKeyboard(kb);c=await card();
    ok(`${size}: above an iPhone keyboard, the sheet and its buttons are in view`,c.inside&&c.buttons&&c.below<=24);
    ok(`${size}: there, the antonyms being edited are in view, whole, the caret’s line too`,editing(c));
    const h0=c.edit.h,more=', unbending, malleable, persuadable, submissive';
    await page.keyboard.type(more);typed+=more;c=await card();
    ok(`${size}: typing grows the antonyms field, its caret’s line in view, the buttons too`,editing(c)&&c.edit.h>h0&&c.buttons);
    ok(`${size}: what was typed is there`,(await page.$eval(ANT_F,e=>e.innerText))===typed);
    await iosKeyboard(kb,vh-kb);c=await card();
    ok(`${size}: with the visible area panned down, the sheet follows it, the antonyms still in view`,c.inside&&c.buttons&&c.below<=24&&editing(c));
    await iosKeyboard(kb);await shot(`${vw}-antonyms-keyboard`);await iosKeyboard(null);
    if(vw===390){
      await tap('#wbSave');await hidden('#wordBox');
      ok(`${size}: Save saves the antonyms`,await toastIs('Saved')&&await word(OBD,w=>same(w.ant,typed.split(', '))));
    }else{
      await tap('#wbClose');await hidden('#wordBox');typed=typed.slice(0,-more.length);
      ok(`${size}: Cancel drops them`,await word(OBD,w=>same(w.ant,typed.split(', '))));
    }
    await quiet();
  }

  /* ---------- 2. a long meaning fills the sheet above the keyboard and scrolls inside itself ---------- */
  await openCard(OBD);await editField('#wbDef');await iosKeyboard(363);
  await page.keyboard.sendCharacter('\n'+LONG);let c=await card();
  ok('a long meaning fills the space above the keyboard and scrolls inside itself, the caret’s line in view',c.ta.scrolls&&c.ta.end&&c.ta.inBody&&c.ta.h>=c.ta.room-24&&c.buttons);
  await page.$eval('#wbDef',e=>e.setSelectionRange(0,0));await page.keyboard.sendCharacter('X');c=await card();
  ok('typing at its start shows the start',c.ta.start&&c.ta.inBody);
  await iosKeyboard(null);await tap('#wbClose');await hidden('#wordBox');
  ok('Cancel keeps the meaning as it was',await word(OBD,w=>w.def===DEF));

  /* ---------- 3. an example and a synonym grow as they're typed; Escape saves them ---------- */
  await openCard(OBD);
  await editField(DEX_F);await iosKeyboard(363);c=await card();const dh=c.edit.h;
  await page.keyboard.press('Enter');await page.keyboard.type('The obdurate tide came in anyway.');c=await card();
  ok('an example typed on a new line grows its field, the caret’s line in view',editing(c)&&c.edit.h>dh+10);
  await editField(SYN_F);c=await card();const sh=c.edit.h;
  await page.keyboard.type(', headstrong, pigheaded, immovable, unbending, implacable');c=await card();
  ok('a synonym list typed past the line grows its field, the caret’s line in view',editing(c)&&c.edit.h>sh+10);
  await iosKeyboard(null);await page.keyboard.press('Escape');await hidden('#wordBox');
  ok('Escape saves both',await word(OBD,w=>w.dex.length===3&&w.dex[2].text==='The obdurate tide came in anyway.'&&w.syn.includes('implacable')));
  await quiet();

  /* ---------- 4. Add opens an empty section, in view above the keyboard; a tap outside saves it ---------- */
  await saveWord(P1,'lanterns');
  must('the lookups are done: Add offers antonyms',await word(LAN,w=>w.tried&&w.tried.wiki&&w.tried.muse&&w.tried.wikt)&&await until(()=>!!document.querySelector('#wordBox [data-add="ant"]')));
  await toastGone();await sleep(100);
  await tap('#wordBox [data-add="ant"]');await iosKeyboard(363);c=await card();
  ok('Add → Antonyms: the empty section is focused and in view above the keyboard, the buttons too',editing(c)&&c.buttons&&(await page.evaluate(s=>document.activeElement===document.querySelector(s),ANT_F)));
  await page.keyboard.type('dark, unlit');await iosKeyboard(null);
  const p=await textPoint();must('a plain text point on screen',!!p);await tapAt(p.x,p.y);
  ok('a tap outside saves it',await hidden('#wordBox')&&await word(LAN,w=>same(w.ant,['dark','unlit'])));
  await quiet();

  /* ---------- 5. Delete in the reader's word card: away from Save; the underline goes; Undo brings both back ---------- */
  await openCard(OBD);
  const far=await page.evaluate(()=>{const d=document.querySelector('#wbDel').getBoundingClientRect(),s=document.querySelector('#wbSave').getBoundingClientRect(),b=document.querySelector('#wordBox').getBoundingClientRect();
    return d.top<b.top+60&&s.bottom>b.bottom-60&&s.top-d.bottom>150;});
  ok('Delete sits in the card’s head, far from Save at its foot',far&&(await page.$eval('#wbDel',e=>e.getAttribute('aria-label')))==='Delete “obdurate”');
  must('the word is underlined',await underlines(OBD)===1);
  await editField('#wbDef');await page.keyboard.type(' Typed, then deleted.');
  await tap('#wbDel');await hidden('#wordBox');
  ok('Delete closes the card: "Moved to Trash · Undo", the underline gone',await toastIs('Moved to Trash · Undo')&&await underlines(OBD)===0);
  ok('…the word is in the Trash, no longer stored',await gone(OBD)&&await trashHas(l=>l.some(e=>e.kind==='word'&&e.word.id===OBD&&e.title==='obdurate')));
  await settled();await tap('#toast button');
  ok('Undo restores it: stored again as it was saved, underlined again',await toastIs('Restored')&&await word(OBD,w=>w.def===DEF&&w.syn.includes('implacable'))&&await until(id=>document.querySelectorAll(`#col .wd[data-w="${id}"]`).length===1,OBD)&&await trashHas(l=>!l.length));
  await quiet();

  /* ---------- 6. light and dark, both sizes, editing the antonyms above the keyboard ---------- */
  for(const [vw,vh,kb] of [[375,667,363],[390,844,460]]){
    if(vw!==375) await phone(vw,vh);
    for(const dark of [false,true]){
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);
      await openCard(OBD);await editField(ANT_F);await iosKeyboard(kb);await shot(`${vw}-antonyms-${dark?'dark':'light'}`);
      await iosKeyboard(null);await tap('#wbClose');await hidden('#wordBox');
    }
  }
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);

  /* ---------- 7. with a mouse on a wide screen: the card floats and drags; pressing Delete doesn't drag it ---------- */
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});await page.reload();await t.reader();
  must('with a mouse, the pointer is fine',!(await touch()));
  await openCard(LAN);c=await card();
  ok('with a mouse, the word card floats by the word: not a sheet, 360 px wide',!c.sheet&&c.inside&&c.buttons&&c.width===360&&c.below>100);
  const head=await page.$eval('#wbTerm',e=>{const r=e.getBoundingClientRect();return {x:r.right+20,y:r.top+r.height/2};});
  await page.mouse.move(head.x,head.y);await page.mouse.down();await page.mouse.move(head.x-120,head.y-60,{steps:5});await page.mouse.up();
  let d=await card();
  ok('its head still drags it',d.left===c.left-120&&d.top===c.top-60);
  const del=await page.$eval('#wbDel',e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
  await page.mouse.move(del.x,del.y);await page.mouse.down();await page.mouse.move(del.x-80,del.y-40,{steps:5});
  c=await card();
  ok('pressing Delete and moving doesn’t drag the card',c.left===d.left&&c.top===d.top);
  await page.mouse.up();await page.mouse.click(del.x,del.y);await hidden('#wordBox');
  ok('a click on Delete deletes the word',await toastIs('Moved to Trash · Undo')&&await gone(LAN)&&await underlines(LAN)===0);
  await settled();await page.click('#toast button');
  ok('…and Undo brings it back, underlined',await toastIs('Restored')&&await word(LAN,w=>same(w.ant,['dark','unlit']))&&await until(id=>document.querySelectorAll(`#col .wd[data-w="${id}"]`).length===1,LAN));
  await quiet();

  /* ---------- 8. Study: Delete on the back of a word and of a fact card ---------- */
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const now=Date.now(),DAY=864e5,srs=due=>({due,interval:1,ease:2.5,reps:1,lapses:0});
  const ex=(text,w)=>{const s=text.indexOf(w);return {text,s,e:s+w.length,bookId:book,pid:'p0',ws:0,we:0,title:'Sheet Words',at:now};};
  const FT='The mole was built in 1820 to shelter the harbour.',FID=factId(book,'hz');
  const A={id:'wsa',term:'abate',def:'To become less intense.',pos:'verb',defSource:'',added:now-9*DAY,examples:[ex('The storm began to abate by noon.','abate')],srs:srs(now-3*DAY)};
  const F={id:FID,kind:'fact',text:FT,blank:{s:FT.indexOf('1820'),e:FT.indexOf('1820')+4},note:'',bookId:book,hlId:'hz',pid:'p0',ws:0,we:4,title:'Sheet Words',section:'',added:now-8*DAY,srs:srs(now-2*DAY)};
  const C={id:'wsc',term:'candor',def:'Openness; frankness.',pos:'noun',defSource:'',added:now-7*DAY,examples:[ex('She spoke with candor.','candor')],srs:srs(now-DAY)};
  await seed([A,F,C],true);
  await page.goto(t.base+'?study=1',{waitUntil:'networkidle0'});await shown('#study');
  await until(()=>!document.querySelector('#syCard').textContent.includes('Gathering'));
  must('the touch screen again',await touch());
  const sy=()=>page.evaluate(()=>({prog:document.querySelector('#syProg').textContent,term:document.querySelector('#syCard .sy-term')?.textContent||'',fact:!!document.querySelector('#syCard .sy-fact'),
    back:!!document.querySelector('#syCard .sy-back'),del:!!document.querySelector('#syCard .sy-del'),end:document.querySelector('#syCard .sy-end h2')?.textContent||''}));
  const showBack=async()=>{await tap('#syActs [data-sy="show"]');await until(()=>!!document.querySelector('#syCard .sy-back'));};
  let s=await sy();
  ok('Study: no Delete on the front',s.prog==='1 of 3'&&s.term==='abate'&&!s.back&&!s.del);
  await showBack();
  const place=await page.evaluate(()=>{const d=document.querySelector('#syCard .sy-del').getBoundingClientRect(),c=document.querySelector('#syCard .sy-card').getBoundingClientRect(),r=document.querySelector('#syActs .sy-rate').getBoundingClientRect();
    return {corner:d.top<c.top+40&&d.right>c.right-60,gap:Math.round(r.top-d.bottom)};});
  ok('the back has Delete in the card’s top corner, far from the ratings',place.corner&&place.gap>150&&(await page.$eval('#syCard .sy-del',e=>e.getAttribute('aria-label')))==='Delete “abate”');
  await shot('study-back-phone-light');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await shot('study-back-phone-dark');await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await tap('#syCard .sy-del');
  s=await sy();
  ok('Delete moves on to the next card: "Moved to Trash · Undo"',await toastIs('Moved to Trash · Undo')&&s.prog==='1 of 2'&&s.fact&&!s.back);
  ok('…the word is in the Trash, no longer stored',await gone('wsa')&&await trashHas(l=>l.some(e=>e.kind==='word'&&e.word.id==='wsa')));
  await settled();await tap('#toast button');
  ok('Undo puts it back as the next card in the deck',await toastIs('Restored')&&same(await sy(),{prog:'1 of 3',term:'abate',fact:false,back:false,del:false,end:''})&&await word('wsa',w=>w.term==='abate'&&w.srs.due===A.srs.due));
  await showBack();await page.keyboard.press('2');await until(()=>document.querySelector('#syProg').textContent==='2 of 3');
  ok('it rates as before',await word('wsa',w=>w.srs.due>now));
  await showBack();
  ok('a fact card’s back has Delete too',(await page.$eval('#syCard .sy-del',e=>e.getAttribute('aria-label')))==='Delete this fact card');
  await tap('#syCard .sy-del');s=await sy();
  ok('deleting a fact card moves on to the next card',await toastIs('Moved to Trash · Undo')&&s.prog==='2 of 2'&&s.term==='candor'&&await gone(FID)&&await trashHas(l=>l.some(e=>e.word&&e.word.id===FID&&e.title==='Sheet Words')));
  await quiet();
  await showBack();await tap('#syCard .sy-del');
  ok('deleting the last card ends the session',await toastIs('Moved to Trash · Undo')&&(await sy()).end==='All caught up'&&await gone('wsc'));
  await settled();await tap('#toast button');
  ok('Undo after the last card brings it back to study',await toastIs('Restored')&&same(await sy(),{prog:'2 of 2',term:'candor',fact:false,back:false,del:false,end:''})&&await word('wsc',()=>true));
  await showBack();await page.keyboard.press('3');
  ok('the session ends with the two words reviewed',await until(()=>document.querySelector('#syCard .sy-end')?.textContent.includes('You reviewed 2 words')));
  // the Words tab: the fact card gone, both words there
  await tap('#syBack');await shown('#shelf');await tap('#nbBtn');await shown('#notebook');
  if(await page.$eval('#nbTabWd',e=>e.getAttribute('aria-selected'))!=='true') await tap('#nbTabWd');
  await until(()=>!document.querySelector('#wdList').textContent.includes('Gathering'));
  ok('the Words tab lists the two words, not the deleted fact card',same((await page.$$eval('#wdList .wcard[data-id]',e=>e.map(x=>x.dataset.id))).sort(),['wsa','wsc']));
  // the back with Delete on a wide screen
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});
  await seed([{...C,id:'wsd',srs:srs(now-DAY)}]);
  await page.goto(t.base+'?study=1',{waitUntil:'networkidle0'});await shown('#study');await until(()=>!!document.querySelector('#syActs [data-sy="show"]'));
  await page.keyboard.press('Space');await until(()=>!!document.querySelector('#syCard .sy-del'));await page.mouse.move(1,1);
  await shot('study-back-desktop-light');
});
