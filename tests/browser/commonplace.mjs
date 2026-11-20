// The Notebook's Commonplace tab: your own notes, lessons and journals, not tied to a book (spec:
// docs/superpowers/specs/2026-10-26-commonplace-book-design.md). Usage: node tests/browser/commonplace.mjs [repo dir]
// Each section starts with no entries and seeds or types what it needs, so CP_ONLY=<section> runs one alone
// (list, topics, sheet, paste, trash) after the shared checks.
import {start,enterLocalMode,sleep,dayKey,waitForFile} from './lib.mjs';

const t=await start('commonplace',8166);
const {page,ok,must,vis,text,until}=t;

/* ---------- shared helpers ---------- */
// The local store: IndexedDB "upwind", store "kv", entries under entry:<id>. The tab rereads them when the Notebook opens.
// every stored entry, by id
const storedEntries=()=>page.evaluate(()=>new Promise((res,rej)=>{
  const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const out={},tx=r.result.transaction('kv'),c=tx.objectStore('kv').openCursor();
    c.onsuccess=()=>{const k=c.result;if(!k)return;if(String(k.key).startsWith('entry:'))out[k.value.id]=k.value;k.continue();};
    tx.oncomplete=()=>{r.result.close();res(out);};tx.onerror=()=>rej(tx.error);};
}));
const clearEntries=()=>page.evaluate(()=>new Promise((res,rej)=>{
  const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite'),c=tx.objectStore('kv').openCursor();
    c.onsuccess=()=>{const k=c.result;if(!k)return;if(String(k.key).startsWith('entry:'))k.delete();k.continue();};
    tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};
}));
// entries straight into the store: [{id, text, date, added, up}]
const putEntries=list=>page.evaluate(list=>new Promise((res,rej)=>{
  const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite'),s=tx.objectStore('kv');for(const e of list)s.put(e,'entry:'+e.id);
    tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};
}),list);
// an entry for putEntries; added counts up so the order within a day is known
let seq=0;
const entry=(id,text,date=dayKey(),added=Date.now()-1e6+(++seq))=>({id,text,date,added,up:added});
// Notebook → Commonplace from wherever the app is, rereading the entries. The tab first shows the entries it holds in
// memory, so this waits until the cards match the store: opening clears the search and topic, so every stored entry
// shows, up to the first 100.
async function openTab(){
  await page.keyboard.press('Escape');
  if(await vis('#notebook')){await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');}
  await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  if(await page.$eval('#nbTabCp',b=>b.getAttribute('aria-selected')!=='true')) await page.click('#nbTabCp');
  await page.waitForSelector('#nbPanelCp:not(.hidden)');
  const ids=Object.keys(await storedEntries());
  await until((ids,n)=>{const l=document.querySelector('#cpList'),c=[...l.querySelectorAll('.cp-card')].map(e=>e.dataset.id);
    return n?c.length===n&&c.every(id=>ids.includes(id)):!l.textContent.includes('Gathering')&&!c.length;},ids,Math.min(ids.length,100));
}
const cardIds=()=>page.$$eval('#cpList .cp-card',els=>els.map(e=>e.dataset.id));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/* ---------- list: stats, months, cards, Markdown, Show more ---------- */
async function testList(){
  // the tab may draw the cached list before the reread lands: wait for n cards
  const cardsAre=n=>page.waitForFunction(n=>document.querySelectorAll('#cpList .cp-card').length===n&&!document.querySelector('#cpList').textContent.includes('Gathering'),{timeout:5000},n).then(()=>sleep(150));
  const A=1e6;
  await putEntries([
    entry('a1','First of the day #alpha','2026-11-05',A+1),entry('a2','Second of the day','2026-11-05',A+2),
    entry('b1','## Heading here\n\nSome **bold** words and [a link](https://example.com/x).\n\n- one\n- two\n\n![pic](https://example.com/p.png)\n\nEnd #beta #alpha','2026-11-02',A+3),
    entry('c1','October note','2026-10-30',A+4),entry('d1','Old note #gamma','2026-09-01',A+5)]);
  await openTab();await cardsAre(5);
  ok('stats line counts entries and topics',(await text('#cpStats')).replace(/\s+/g,' ').trim()==='5 entries · 3 topics',await text('#cpStats'));
  ok('newest first, a later add first within a day',same(await cardIds(),['a2','a1','b1','c1','d1']),JSON.stringify(await cardIds()));
  const heads=await page.$$eval('#cpList .cgh',h=>h.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
  ok('month headings with counts, newest first',same(heads,['November 2026 · 3','October 2026 · 1','September 2026 · 1']),JSON.stringify(heads));
  ok('a card shows its day',(await text('#cpList .cp-card[data-id="a1"] .cp-day')).trim()==='Nov 5');
  const b=await page.$eval('#cpList [data-id="b1"] .cp-text',el=>({h:!!el.querySelector('h3,h4'),s:!!el.querySelector('strong'),li:el.querySelectorAll('.li').length,a:el.querySelector('a')&&el.querySelector('a').href,img:!!el.querySelector('img,figure')}));
  ok('Markdown is formatted: heading, bold, list, link',b.h&&b.s&&b.li===2&&b.a==='https://example.com/x',JSON.stringify(b));
  ok('an image line is skipped',!b.img);
  ok('a link opens as a link, not the sheet',await (async()=>{await page.evaluate(()=>{document.querySelector('#cpList [data-id="b1"] a').addEventListener('click',e=>e.preventDefault(),{once:true});});await page.click('#cpList [data-id="b1"] a');return !(await vis('#entryBox'));})());
  // a tapped #tag
  await page.click('#cpList [data-id="a1"] .cp-tag');
  ok('a tapped #tag does not open the sheet',!(await vis('#entryBox')));
  await openTab();await cardsAre(5);
  // a card opens from a tap and Enter
  await page.click('#cpList [data-id="c1"] .cp-text');
  ok('a tap on a card opens it',await vis('#entryBox'));
  await page.keyboard.press('Escape');await page.click('#enSave').catch(()=>{});
  ok('no card is clipped when short',(await page.$$('#cpList .cp-more')).length===0);

  await page.evaluate(()=>{document.documentElement.dataset.theme='light';});
  await t.shot('commonplace-list-light');
  await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
  await t.shot('commonplace-list-dark');
  await page.evaluate(()=>{document.documentElement.dataset.theme='light';});
  // a long entry
  await clearEntries();
  await putEntries([entry('long',Array.from({length:30},(_,i)=>`Line number ${i} of a long entry.`).join('\n\n'),'2026-11-05')]);
  await openTab();await cardsAre(1);
  ok('a long entry is clipped with Show more',(await page.$('#cpList .cp-text.clip'))&&(await page.$('#cpList .cp-more')));
  await page.click('#cpList .cp-more');
  ok('Show more unclips it and does not open the sheet',!(await page.$('#cpList .cp-text.clip'))&&!(await page.$('#cpList .cp-more'))&&!(await vis('#entryBox')));

  // 105 entries
  await clearEntries();
  await putEntries(Array.from({length:105},(_,i)=>entry('n'+i,'Note '+i,'2026-11-05')));
  await openTab();await cardsAre(100);
  ok('105 entries draw 100 cards and a Show more',(await cardIds()).length===100&&!!(await page.$('#cpMoreList')));
  await page.click('#cpMoreList');
  ok('Show more adds the rest',(await cardIds()).length===105&&!(await page.$('#cpMoreList')));
}
/* ---------- end of list ---------- */

/* ---------- topics and search ---------- */
async function testTopics(){
  await putEntries([
    entry('a','Notes on #Lesson and #stoicism','2026-03-03'),
    entry('b','A Café visit #lesson','2026-03-02'),
    entry('c','Plain thought #journal','2026-03-01'),
    entry('d','Another #lesson, no cafe','2026-02-01')]);
  await openTab();await until(()=>document.querySelectorAll('#cpList .cp-card').length===4);
  const chips=()=>page.$$eval('#cpChips .chip',b=>b.map(x=>x.textContent.trim()));
  const click=label=>page.evaluate(l=>[...document.querySelectorAll('#cpChips .chip')].find(b=>b.textContent.trim().startsWith(l)).click(),label);
  const type=async v=>{await page.$eval('#cpQ',(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},v);};
  ok('chips: All, then by count, then name',same(await chips(),['All 4','#Lesson 3','#journal 1','#stoicism 1']));
  await click('#Lesson');
  ok('a chip filters the cards',same(await cardIds(),['a','b','d']));
  ok('the chosen chip is pressed',await page.$eval('#cpChips .chip[aria-pressed="true"]',b=>b.textContent.includes('Lesson')));
  await click('#Lesson');
  ok('tapping it again clears',(await cardIds()).length===4);
  await click('#journal');await click('All');
  ok('All clears the topic',(await cardIds()).length===4);
  await type('cafe');
  ok('search folds accents',same(await cardIds(),['b','d']));
  ok('counts follow the search',same(await chips(),['All 2','#lesson 2']));
  await type('#journal');
  ok('search by #tag',same(await cardIds(),['c']));
  await type('lesson');await click('#stoicism');
  ok('search and topic together',same(await cardIds(),['a']));
  await type('cafe');
  ok('a chosen topic stays at count 0',(await chips()).some(c=>c.startsWith('#stoicism 0')));
  await type('');await click('#stoicism');
  await clearEntries();await openTab();await until(()=>document.querySelector('#cpCtrl').classList.contains('hidden'));
  ok('#cpCtrl hidden with no entries',!(await vis('#cpCtrl')));
}
/* ---------- end of topics and search ---------- */

/* ---------- the entry sheet ---------- */
async function testSheet(){
  const {mkdirSync}=await import('node:fs'),{dirname,join}=await import('node:path'),{fileURLToPath}=await import('node:url');
  const shots=join(dirname(fileURLToPath(import.meta.url)),'out','commonplace');mkdirSync(shots,{recursive:true});
  const stored=async()=>Object.values(await storedEntries());
  const settle=async f=>{for(let i=0;i<40;i++){if(await f())return true;await sleep(100);}return false;};
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const hiddenNow=()=>until(()=>document.querySelector('#entryBox').classList.contains('hidden'));
  const toastIs=m=>until(m=>{const e=document.querySelector('#toast');return e.classList.contains('on')&&e.textContent===m;},m);
  const boxHidden=()=>page.$eval('#entryBox',b=>b.classList.contains('hidden'));
  const openNew=async()=>{await page.click('#cpNew');await page.waitForSelector('#entryBox:not(.hidden)');};
  const card=async id=>{await hiddenNow();await frame();await page.waitForSelector(`.cp-card[data-id="${id}"]`);await page.click(`.cp-card[data-id="${id}"]`);await until(()=>!document.querySelector('#entryBox').classList.contains('hidden')&&document.querySelector('#enDate').value&&document.activeElement.id==='enTa');};
  const undo=async()=>{await toastIs('Entry saved');await sleep(400);await page.click('#toast button');};
  const outside=()=>page.mouse.click(5,5);
  const today=dayKey();

  await openNew();
  ok('a new entry opens with the field focused and today’s date',await page.evaluate(()=>document.activeElement.id==='enTa')||await settle(()=>page.evaluate(()=>document.activeElement.id==='enTa')));
  const d0=await page.$eval('#enDate',i=>i.value);
  ok('the date row shows today as "Month D, YYYY"',/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(d0));
  ok('the head says Entry and has no Delete for a new entry',await text('#entryBox h2')==='Entry'&&!(await vis('#enDel')));
  await page.type('#enTa','Typed, then a tap outside');await outside();
  ok('a tap outside saves it',await settle(async()=>(await stored()).length===1)&&await boxHidden());
  let [a]=await stored();
  ok('with today’s date',a.date===today&&a.text==='Typed, then a tap outside');

  await openNew();await page.type('#enTa','Saved by Escape');await page.keyboard.press('Escape');
  ok('Escape saves',await settle(async()=>(await stored()).length===2)&&await boxHidden());

  await openNew();await page.type('#enTa','Dropped');await page.click('#enSave');await hiddenNow();
  ok('Done saves the new entry',await settle(async()=>(await stored()).length===3));
  await undo();
  ok('Undo of a new entry deletes it',await settle(async()=>(await stored()).length===2&&!(await stored()).some(x=>x.text==='Dropped')));
  ok('there is no Cancel button',!(await page.$('#enCancel')));
  await openNew();await page.keyboard.press('Escape');await hiddenNow();
  ok('an empty new entry is not saved',(await stored()).length===2&&await boxHidden());

  // autosave without closing: about 1 s after typing stops; a new entry is created on its first autosave
  await openNew();await page.type('#enTa','Autosaved');
  ok('a new entry autosaves once it has text, the sheet stays open',await settle(async()=>(await stored()).some(x=>x.text==='Autosaved'))&&!(await boxHidden()));
  await page.type('#enTa',' again');
  ok('…and the same entry updates (no duplicate)',await settle(async()=>(await stored()).some(x=>x.text==='Autosaved again'))&&(await stored()).filter(x=>x.text.startsWith('Autosaved')).length===1&&!(await boxHidden()));
  await page.click('#enSave');await hiddenNow();
  await undo();
  ok('Undo of a new entry after autosaves removes it',await settle(async()=>!(await stored()).some(x=>x.text.startsWith('Autosaved')))&&(await stored()).length===2);

  // B, I and U: wrap the selection or the word at the caret, and unwrap
  await openNew();await page.type('#enTa','alpha beta gamma');
  const sel=(a,b)=>page.$eval('#enTa',(x,a,b)=>{x.focus();x.setSelectionRange(a,b);},a,b);
  const val=()=>page.$eval('#enTa',x=>x.value),selNow=()=>page.$eval('#enTa',x=>[x.selectionStart,x.selectionEnd]);
  const fmt=w=>page.click(`#entryBox .fmt [data-w="${w}"]`);
  await sel(6,10);await fmt('**');
  ok('B wraps the selection in ** and keeps it selected',await val()==='alpha **beta** gamma'&&same(await selNow(),[8,12])&&await page.evaluate(()=>document.activeElement.id==='enTa'));
  await fmt('**');
  ok('B again unwraps it',await val()==='alpha beta gamma'&&same(await selNow(),[6,10]));
  await sel(2,2);await fmt('*');
  ok('I with only a caret wraps the word at the caret in *',await val()==='*alpha* beta gamma');
  await fmt('*');ok('I again unwraps',await val()==='alpha beta gamma');
  await sel(11,16);await fmt('u');
  ok('U wraps in <u>…</u>',await val()==='alpha beta <u>gamma</u>');
  await fmt('u');ok('U again unwraps',await val()==='alpha beta gamma');
  await sel(6,10);await fmt('**');await fmt('*');
  ok('bold and italic stack as ***',await val()==='alpha ***beta*** gamma');
  await fmt('*');ok('I unwraps only the italic',await val()==='alpha **beta** gamma');
  await sel(6,14);await fmt('**');
  ok('B unwraps a selection that includes its markers',await val()==='alpha beta gamma');
  await page.keyboard.down('Control');await page.keyboard.press('b');await page.keyboard.up('Control');
  ok('Ctrl+B wraps too',(await val()).includes('**'));
  await page.keyboard.press('Escape');await hiddenNow();await undo();await settle(async()=>(await stored()).length===2);

  await clearEntries();await putEntries([entry('s1','Original text','2026-01-02')]);await openTab();
  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  ok('an existing entry opens with its text and date, and shows Delete',await page.$eval('#enTa',x=>x.value)==='Original text'&&await page.$eval('#enDate',i=>i.value)==='January 2, 2026'&&await vis('#enDel'));
  const up0=(await storedEntries()).s1.up;
  await page.keyboard.press('Escape');await hiddenNow();
  const s1=(await storedEntries()).s1;
  ok('saving it unchanged writes nothing (up unchanged) and gives no toast',s1.up===up0&&await boxHidden()&&!(await page.$eval('#toast',e=>e.classList.contains('on')&&/saved/i.test(e.textContent))));

  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.click('#enTa');await page.keyboard.press('End');await page.type('#enTa',' and more');await outside();
  ok('editing an existing entry saves the new text, same id, same date',await settle(async()=>(await storedEntries()).s1?.text==='Original text and more')&&(await storedEntries()).s1.date==='2026-01-02'&&(await stored()).length===1);
  await undo();
  ok('Undo puts back what it was when opened',await settle(async()=>(await storedEntries()).s1?.text==='Original text')&&(await storedEntries()).s1.date==='2026-01-02');
  await card('s1');await page.click('#enTa');await page.keyboard.press('End');await page.type('#enTa',' and more');await sleep(1500);
  ok('an existing entry autosaves about 1 s after typing stops, the sheet open',(await storedEntries()).s1.text==='Original text and more'&&!(await boxHidden()));
  await page.keyboard.press('Escape');await hiddenNow();

  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.click('#entryBox .dq [data-ago="1"]');await page.click('#enSave');
  const y=new Date();y.setDate(y.getDate()-1);
  ok('Yesterday stores yesterday’s date',await settle(async()=>(await storedEntries()).s1?.date===dayKey(y)));

  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.$eval('#enDate',i=>{i.value='';});await page.type('#enDate','March 3, 2024');await page.click('#enSave');
  ok('"March 3, 2024" is stored as 2024-03-03',await settle(async()=>(await storedEntries()).s1?.date==='2024-03-03'));

  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.$eval('#enDate',i=>{i.value='';});await page.type('#enDate','sometime soon');await page.type('#enTa',' changed');await page.click('#enSave');
  await toastIs('Write the date like November 5, 2026');
  ok('an unreadable date keeps the sheet open with a toast',!(await boxHidden())&&await page.$eval('#toast',e=>e.classList.contains('on')&&e.textContent==='Write the date like November 5, 2026'));
  ok('and writes nothing',!((await storedEntries()).s1.text.includes('changed')));
  await page.evaluate(()=>{const e=document.querySelector('#toast');e.classList.remove('on');e.textContent='';});
  await page.$eval('.cp-card[data-id="s1"]',c=>c.click());
  await toastIs('Write the date like November 5, 2026');
  ok('opening another card meanwhile keeps the sheet open with its typed text and the toast again',!(await boxHidden())&&await page.$eval('#enTa',x=>x.value.endsWith('changed'))&&await page.$eval('#enDate',i=>i.value==='sometime soon'));
  await page.$eval('#enDate',i=>{i.value='';});await page.click('#enSave');
  ok('an empty date keeps the entry’s own',await settle(async()=>(await storedEntries()).s1?.text.endsWith('changed'))&&(await storedEntries()).s1.date==='2024-03-03');

  await openNew();
  await page.$eval('#enTa',x=>{x.value='x'.repeat(800*1024+1);});await page.click('#enSave');await toastIs('Too long for one entry. Add it to the shelf as a book instead.');
  ok('text over 800 KB is refused, the sheet stays open',!(await boxHidden())&&await page.$eval('#toast',e=>e.textContent==='Too long for one entry. Add it to the shelf as a book instead.')&&(await stored()).length===1);
  await page.$eval('#enTa',x=>{x.value='';});await page.keyboard.press('Escape');await hiddenNow();

  // screenshots, light and dark
  await clearEntries();await putEntries([entry('s2','A line to look at.\nAnother line, with #topic and <u>underlined</u> words.','2026-01-02')]);await openTab();
  ok('<u>…</u> renders as underline in a card',await page.$eval('.cp-card[data-id="s2"] u',u=>u.textContent==='underlined'&&getComputedStyle(u).textDecorationLine.includes('underline')));
  for(const dark of [false,true]){
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);
    await card('s2');await page.waitForSelector('#entryBox:not(.hidden)');await frame();
    await page.screenshot({path:join(shots,`sheet-${dark?'dark':'light'}.png`)});await page.click('#enSave');
  }
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  const cls=()=>page.$eval('#entryBox',b=>({sheet:b.classList.contains('sheet'),r:b.getBoundingClientRect().toJSON(),w:innerWidth}));
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,hasTouch:true,isMobile:true});await page.reload();await openTab();
  await page.tap('#cpNew');await page.waitForSelector('#entryBox:not(.hidden)');await frame();
  let c=await cls();
  ok('at 390 px with a touch screen it is a full-width sheet above the bottom edge',c.sheet&&c.r.width>=c.w-20&&c.r.width<=640&&c.r.bottom<=844);
  // a paste into the empty field without a date line keeps the date picked, and the sheet grows to the text
  const h0=await page.$eval('#enTa',x=>x.clientHeight);
  await page.$eval('#enDate',i=>{i.value='March 3, 2024';});
  await page.$eval('#enTa',x=>{const dt=new DataTransfer();dt.setData('text/plain',Array.from({length:30},(_,i)=>'line '+i).join('\n'));x.focus();x.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));});
  await frame();
  ok('a paste with no date line keeps the date typed in the row',await page.$eval('#enDate',i=>i.value)==='March 3, 2024'&&await page.$eval('#enTa',x=>x.value.startsWith('line 0')));
  ok('…and the field fills the sheet down to the date row',await page.$eval('#enTa',x=>{const r=x.getBoundingClientRect(),d=document.querySelector('.en-date').getBoundingClientRect();return r.height>250&&Math.abs(d.top-r.bottom)<30;}));
  ok('the sheet leaves about 12% at the top, and a mouse-less sheet is dimmed',await page.$eval('#entryBox',b=>{const t=b.getBoundingClientRect().top;return t>80&&t<125;})&&await page.$eval('#entryBox',b=>getComputedStyle(b).boxShadow.includes('rgba(20, 12, 6')));
  await page.touchscreen.tap(195,40);
  ok('a tap on the top strip closes it, saving the entry',await settle(boxHidden)&&await settle(async()=>(await stored()).some(x=>x.text.startsWith('line 0'))));
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});await page.reload();await openTab();
  await openNew();await frame();c=await cls();
  ok('with a mouse at 1280 px it floats, not a sheet',!c.sheet&&c.r.width<700);
  await page.screenshot({path:join(shots,'float.png')});await page.click('#enSave');
  ok('with a mouse the panel is about 440 px wide and tall',c.r.width>=400&&c.r.width<=460&&c.r.height>=900-40);

  // an entry saved or deleted while the Notebook's reread is in flight stays that way when the read lands
  await clearEntries();await putEntries([entry('r1','Kept at first','2026-01-02'),entry('r2','Deleted meanwhile','2026-01-03')]);await openTab();
  await page.evaluate(()=>{const o=IDBObjectStore.prototype.getAll;IDBObjectStore.prototype.getAll=function(...a){
    const r=o.apply(this,a),f={addEventListener(){},removeEventListener(){}};r.onsuccess=()=>{const v=r.result;setTimeout(()=>{f.result=v;f.onsuccess&&f.onsuccess();},1500);};r.onerror=()=>f.onerror&&f.onerror();return f;};});
  await page.keyboard.press('Escape');await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  await openNew();await page.type('#enTa','Saved during the read');await page.click('#enSave');
  await page.waitForSelector('#cpList .cp-card[data-id="r2"]');await page.click('#cpList .cp-card[data-id="r2"]');await page.waitForSelector('#entryBox:not(.hidden)');await page.click('#enDel');
  await sleep(2200);
  const mem=await page.$$eval('#cpList .cp-card',els=>els.map(e=>e.textContent)),stIds=Object.keys(await storedEntries());
  ok('the entry saved during the read is still listed once it lands, with the older one',mem.length===2&&mem.some(x=>x.includes('Saved during the read'))&&mem.some(x=>x.includes('Kept at first'))&&stIds.length===2);
  ok('…and one deleted during the read stays gone',!mem.some(x=>x.includes('Deleted meanwhile')));
  await page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('upwind',1);r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite'),c=tx.objectStore('kv').openCursor();
    c.onsuccess=()=>{const k=c.result;if(!k)return;if(String(k.key).startsWith('trash:'))k.delete();k.continue();};tx.oncomplete=()=>{r.result.close();res();};};}));
  await page.reload();await openTab();
}
/* ---------- end of the entry sheet ---------- */

/* ---------- paste ---------- */
async function testPaste(){
  // a clipboard stub (as paste.mjs's): window.__clip {txt, png, refuse}; each read logs 'tap' when it started inside a click
  await page.evaluateOnNewDocument(()=>{
    window.__clip={};window.__reads=[];let tap=false;
    addEventListener('click',()=>{tap=true;},true);addEventListener('click',()=>{tap=false;});
    const refused=()=>Promise.reject(new DOMException('Read permission denied.','NotAllowedError'));
    const png=()=>new Promise(r=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d').fillRect(0,0,4,4);c.toBlob(r,'image/png');});
    const read=()=>{window.__reads.push(tap?'tap':'late');const c=window.__clip;if(c.refuse) return refused();
      const types=[c.txt&&'text/plain',c.png&&'image/png'].filter(Boolean);
      return Promise.resolve(types.length?[{types,getType:async ty=>ty==='image/png'?png():new Blob([c.txt],{type:ty})}]:[]);};
    Object.defineProperty(Navigator.prototype,'clipboard',{configurable:true,get:()=>({read,readText:()=>Promise.resolve(window.__clip.txt||''),writeText:()=>Promise.resolve()})});
  });
  await page.reload({waitUntil:'networkidle0'});await openTab();
  const clip=c=>page.evaluate(c=>{window.__clip=c;const e=document.querySelector('#toast');e.classList.remove('on');e.textContent='';},c);
  const tap=()=>page.$eval('#cpPaste',e=>e.click());
  const toastSays=m=>until(m=>{const e=document.querySelector('#toast');return e.classList.contains('on')&&e.textContent===m;},m);
  // closes the sheet and drops what it made: Done, then the toast's Undo
  const closeSheet=async()=>{await page.click('#enSave');await until(()=>document.querySelector('#entryBox').classList.contains('hidden'));
    if(await page.$eval('#toast',e=>e.classList.contains('on')&&e.textContent.startsWith('Entry saved'))){await sleep(400);await page.click('#toast button');await sleep(150);}};
  const sheet=()=>page.evaluate(()=>({ta:document.querySelector('#enTa').value,date:document.querySelector('#enDate').value,open:!document.querySelector('#entryBox').classList.contains('hidden')}));
  const pasteOn=(sel,txt)=>page.$eval(sel,(e,txt)=>{const dt=new DataTransfer();dt.setData('text/plain',txt);if(e!==document.body)e.focus();
    const ev=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});e.dispatchEvent(ev);return ev.defaultPrevented;},txt);
  const sheetUp=()=>page.waitForSelector('#entryBox:not(.hidden)');

  await clip({txt:'March 3, 2024\nA note on fog #weather'});await tap();await sheetUp();
  let s=await sheet();
  ok('Paste with a first-line date: the sheet holds the rest and the date',s.ta==='A note on fog #weather'&&s.date==='March 3, 2024');
  ok('…read inside the tap',(await page.evaluate(()=>window.__reads.at(-1)))==='tap');
  ok('…and nothing is stored until Save',Object.keys(await storedEntries()).length===0);
  await closeSheet();

  await clip({txt:'Plain thought'});await tap();await sheetUp();s=await sheet();
  ok('Plain text opens with today’s date',s.ta==='Plain thought'&&s.date===new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}));
  await page.click('#enSave');await until(()=>document.querySelectorAll('#cpList .cp-card').length===1);
  const st=Object.values(await storedEntries());
  ok('Save stores the pasted entry',st.length===1&&st[0].text==='Plain thought'&&st[0].date===dayKey());

  await clip({png:true});await tap();await toastSays('Commonplace keeps text only.');
  ok('a picture only: the toast, no sheet',!(await sheet()).open);
  await clip({});await tap();await toastSays('The clipboard is empty');
  ok('an empty clipboard: the toast, no sheet',!(await sheet()).open);

  await clip({refuse:true});await tap();await sheetUp();await toastSays('Couldn’t read the clipboard. Paste into the box instead.');
  ok('a refused read: a new sheet with the field focused',await until(()=>document.activeElement.id==='enTa')&&(await sheet()).ta==='');
  ok('…a paste into that empty field takes the date',await pasteOn('#enTa','2024-03-03\nFrom the box')===true&&(s=await sheet()).ta==='From the box'&&s.date==='March 3, 2024');
  await page.evaluate(()=>{document.querySelector('#enTa').value='typed already';});
  ok('a paste into a field with text stays a normal paste',await pasteOn('#enTa','March 3, 2024\nmore')===false&&(await sheet()).ta==='typed already');
  await closeSheet();

  await page.evaluate(()=>document.activeElement&&document.activeElement.blur());
  await clip({txt:'July 4, 2025\nFrom the keyboard'});
  await pasteOn('body',  'July 4, 2025\nFrom the keyboard');await sheetUp();s=await sheet();
  ok('a paste event on the tab outside a field opens the sheet',s.ta==='From the keyboard'&&s.date==='July 4, 2025');
  await closeSheet();
  ok('nothing was stored beyond the one saved entry',Object.keys(await storedEntries()).length===1);
}
/* ---------- end of paste ---------- */

/* ---------- delete, the Trash and backup ---------- */
async function testTrash(){
  const tst=()=>text('#toast'),rows=()=>page.$$eval('#trashList .tr-row',els=>els.map(e=>e.textContent.replace(/\s+/g,' ')));
  const openTrash=async()=>{await page.keyboard.press('Escape');if(await vis('#notebook')){await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');}
    await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');
    await until(()=>!document.querySelector('#trashList').textContent.includes('Opening'));};
  const delFirst=async()=>{await page.waitForSelector('#cpList .cp-card');await page.click('#cpList .cp-card');await page.waitForSelector('#entryBox:not(.hidden)');await page.click('#enDel');};
  const E1=entry('tr1','  \nFirst line of a trash note\nsecond line #lesson','2026-10-03');
  await putEntries([E1]);await openTab();
  await delFirst();
  await until(()=>document.querySelectorAll('#cpList .cp-card').length===0);
  ok('Delete moves the entry to the Trash: card and stored entry go',(await tst())==='Moved to Trash · Undo'&&!(await storedEntries()).tr1);
  await page.click('#toast button');await until(()=>document.querySelectorAll('#cpList .cp-card').length===1);
  ok('Undo brings it back as it was',same((await storedEntries()).tr1,E1)&&(await cardIds()).join()==='tr1');
  await delFirst();await until(()=>document.querySelectorAll('#cpList .cp-card').length===0);
  await openTrash();
  const r1=await rows();
  ok('the Trash lists "Entry · <first line>" with the text and date',r1.length===1&&r1[0].includes('Entry · First line of a trash note')&&r1[0].includes('second line #lesson')&&r1[0].includes('October 3, 2026'));
  await page.click('#trashList [data-a="restore"]');await until(()=>document.querySelectorAll('#trashList .tr-row').length===0);
  ok('Restore puts it back',same((await storedEntries()).tr1,E1));
  await page.keyboard.press('Escape');await openTab();
  ok('… and the card shows',(await cardIds()).join()==='tr1');
  await delFirst();await until(()=>document.querySelectorAll('#cpList .cp-card').length===0);
  await openTrash();await page.waitForSelector('#trashList [data-a="forget"]');await page.click('#trashList [data-a="forget"]');await page.click('#trashList [data-a="forget"]');
  await until(()=>document.querySelectorAll('#trashList .tr-row').length===0);
  ok('Delete forever removes it from the Trash and the store',!(await storedEntries()).tr1&&(await rows()).length===0);
  // backup round trip
  await page.keyboard.press('Escape');
  const E2=entry('tr2','Backed up entry','2026-10-04'),E3=entry('tr3','Edited later','2026-10-05');
  await putEntries([E2,E3]);await openTab();
  await page.keyboard.press('Escape');await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  const fs=await import('node:fs'),path=await import('node:path');
  for(const f of fs.readdirSync(t.dl)) if(f.startsWith('own-shelf-backup')) fs.unlinkSync(path.join(t.dl,f));
  await page.click('#backupBtn');
  const bk=await waitForFile(t.dl,/^own-shelf-backup.*\.json$/);
  ok('Back up shelf writes a file',!!bk);
  const data=JSON.parse(fs.readFileSync(path.join(t.dl,bk),'utf8'));
  ok('… holding the entries',(data.entries||[]).map(e=>e.id).sort().join()==='tr2,tr3');
  await page.keyboard.press('Escape');
  await putEntries([{...E3,text:'Edited later, newer text',up:E3.up+5e6}]);
  await clearEntriesById(['tr2']);
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  await (await page.$('#restoreFile')).uploadFile(path.join(t.dl,bk));
  await until(()=>document.querySelector('#setM').classList.contains('hidden'));
  ok('a restore that adds only entries says so',(await tst())==='Restored 1 entry');
  await openTab();
  const got=await storedEntries();
  ok('Restore from backup brings back the deleted entry',got.tr2&&got.tr2.text==='Backed up entry'&&(await cardIds()).includes('tr2'));
  ok('… and an entry edited after the backup keeps its newer text',got.tr3.text==='Edited later, newer text');
  async function clearEntriesById(ids){await page.evaluate(ids=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite');for(const i of ids)tx.objectStore('kv').delete('entry:'+i);tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};}),ids);}
}
/* ---------- end of delete, the Trash and backup ---------- */

await t.run(async()=>{
  await enterLocalMode(t,must);

  // the tab itself: third in the Notebook, empty at first, remembered, reached with the arrow keys
  await openTab();
  ok('Commonplace is the third tab',same(await page.$$eval('#nbTabs [role="tab"]',b=>b.map(x=>x.textContent)),['Highlights','Words','Commonplace']));
  ok('an empty tab says what it is for',(await text('#cpList')).includes('Your own notes, lessons and journals')&&!(await vis('#nbPanelHl'))&&!(await vis('#nbPanelWd')));
  ok('only its stats line shows',await vis('#cpStats')&&!(await vis('#nbStats'))&&!(await vis('#wdStats')));
  await page.focus('#nbTabCp');await page.keyboard.press('ArrowRight');
  ok('ArrowRight from Commonplace wraps to Highlights',await page.$eval('#nbTabHl',b=>b.getAttribute('aria-selected')==='true'&&document.activeElement===b));
  await page.keyboard.press('ArrowLeft');
  ok('ArrowLeft from Highlights goes to Commonplace',await vis('#nbPanelCp'));
  await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  ok('the Notebook opens on the tab picked last',await vis('#nbPanelCp'));

  // the skeleton's path: New entry, type, Save → a stored entry and its card
  await page.click('#cpNew');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.type('#enTa','First thought #lesson');await page.click('#enSave');
  await until(()=>document.querySelectorAll('#cpList .cp-card').length===1);
  const st=Object.values(await storedEntries());
  ok('New entry, typed and saved, is stored with today’s date',st.length===1&&st[0].text==='First thought #lesson'&&st[0].date===dayKey()&&st[0].added>0&&st[0].up>0);
  ok('and shows as a card',(await cardIds()).length===1);

  const only=process.env.CP_ONLY;
  for(const [name,section] of [['list',testList],['topics',testTopics],['sheet',testSheet],['paste',testPaste],['trash',testTrash]]){
    if(only&&only!==name) continue;
    await clearEntries();await openTab();await section();
  }
});
