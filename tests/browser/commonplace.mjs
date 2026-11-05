// The Notebook's Commonplace tab: your own notes, lessons and journals, not tied to a book (spec:
// docs/superpowers/specs/2026-10-26-commonplace-book-design.md). Usage: node tests/browser/commonplace.mjs [repo dir]
// Each section starts with no entries and seeds or types what it needs, so CP_ONLY=<section> runs one alone
// (list, topics, sheet, paste, trash) after the shared checks.
import {start,enterLocalMode,sleep,dayKey} from './lib.mjs';

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
// Notebook → Commonplace from wherever the app is, rereading the entries.
async function openTab(){
  await page.keyboard.press('Escape');
  if(await vis('#notebook')){await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');}
  await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  if(await page.$eval('#nbTabCp',b=>b.getAttribute('aria-selected')!=='true')) await page.click('#nbTabCp');
  await page.waitForSelector('#nbPanelCp:not(.hidden)');
  await until(()=>!document.querySelector('#cpList').textContent.includes('Gathering'));
}
const cardIds=()=>page.$$eval('#cpList .cp-card',els=>els.map(e=>e.dataset.id));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/* ---------- list: stats, months, cards, Markdown, Show more ---------- */
async function testList(){
}
/* ---------- end of list ---------- */

/* ---------- topics and search ---------- */
async function testTopics(){
}
/* ---------- end of topics and search ---------- */

/* ---------- the entry sheet ---------- */
async function testSheet(){
  const {mkdirSync}=await import('node:fs'),{dirname,join}=await import('node:path'),{fileURLToPath}=await import('node:url');
  const shots=join(dirname(fileURLToPath(import.meta.url)),'out','commonplace');mkdirSync(shots,{recursive:true});
  const stored=async()=>Object.values(await storedEntries());
  const settle=async f=>{for(let i=0;i<40;i++){if(await f())return true;await sleep(100);}return false;};
  const boxHidden=()=>page.$eval('#entryBox',b=>b.classList.contains('hidden'));
  const openNew=async()=>{await page.click('#cpNew');await page.waitForSelector('#entryBox:not(.hidden)');};
  const card=async id=>{await page.waitForSelector(`.cp-card[data-id="${id}"]`);await page.click(`.cp-card[data-id="${id}"]`);};
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

  await openNew();await page.type('#enTa','Dropped');await page.click('#enCancel');await sleep(300);
  ok('Cancel drops what was typed',(await stored()).length===2&&await boxHidden());
  await openNew();await page.keyboard.press('Escape');await sleep(300);
  ok('an empty new entry is not saved',(await stored()).length===2&&await boxHidden());

  await clearEntries();await putEntries([entry('s1','Original text','2026-01-02')]);await openTab();
  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  ok('an existing entry opens with its text and date, and shows Delete',await page.$eval('#enTa',x=>x.value)==='Original text'&&await page.$eval('#enDate',i=>i.value)==='January 2, 2026'&&await vis('#enDel'));
  const up0=(await storedEntries()).s1.up;
  await page.keyboard.press('Escape');await sleep(400);
  const s1=(await storedEntries()).s1;
  ok('saving it unchanged writes nothing (up unchanged) and gives no toast',s1.up===up0&&await boxHidden()&&!(await page.$eval('#toast',e=>e.classList.contains('on')&&/saved/i.test(e.textContent))));

  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.click('#enTa');await page.keyboard.press('End');await page.type('#enTa',' and more');await outside();
  ok('editing an existing entry saves the new text, same id, same date',await settle(async()=>(await storedEntries()).s1?.text==='Original text and more')&&(await storedEntries()).s1.date==='2026-01-02'&&(await stored()).length===1);

  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.click('#entryBox .dq [data-ago="1"]');await page.click('#enSave');
  const y=new Date();y.setDate(y.getDate()-1);
  ok('Yesterday stores yesterday’s date',await settle(async()=>(await storedEntries()).s1?.date===dayKey(y)));

  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.$eval('#enDate',i=>{i.value='';});await page.type('#enDate','March 3, 2024');await page.click('#enSave');
  ok('"March 3, 2024" is stored as 2024-03-03',await settle(async()=>(await storedEntries()).s1?.date==='2024-03-03'));

  await card('s1');await page.waitForSelector('#entryBox:not(.hidden)');
  await page.$eval('#enDate',i=>{i.value='';});await page.type('#enDate','sometime soon');await page.type('#enTa',' changed');await page.click('#enSave');
  await sleep(300);
  ok('an unreadable date keeps the sheet open with a toast',!(await boxHidden())&&await page.$eval('#toast',e=>e.classList.contains('on')&&e.textContent==='Write the date like November 5, 2026'));
  ok('and writes nothing',!((await storedEntries()).s1.text.includes('changed')));
  await page.$eval('#enDate',i=>{i.value='';});await page.click('#enSave');
  ok('an empty date keeps the entry’s own',await settle(async()=>(await storedEntries()).s1?.text.endsWith('changed'))&&(await storedEntries()).s1.date==='2024-03-03');

  await openNew();
  await page.$eval('#enTa',x=>{x.value='x'.repeat(800*1024+1);});await page.click('#enSave');await sleep(300);
  ok('text over 800 KB is refused, the sheet stays open',!(await boxHidden())&&await page.$eval('#toast',e=>e.textContent==='Too long for one entry. Add it to the shelf as a book instead.')&&(await stored()).length===1);
  await page.click('#enCancel');

  // screenshots, light and dark
  await clearEntries();await putEntries([entry('s2','A line to look at.\nAnother line, with #topic.','2026-01-02')]);await openTab();
  for(const dark of [false,true]){
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:dark?'dark':'light'}]);
    await card('s2');await page.waitForSelector('#entryBox:not(.hidden)');await sleep(250);
    await page.screenshot({path:join(shots,`sheet-${dark?'dark':'light'}.png`)});await page.click('#enCancel');
  }
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  const cls=()=>page.$eval('#entryBox',b=>({sheet:b.classList.contains('sheet'),r:b.getBoundingClientRect().toJSON(),w:innerWidth}));
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,hasTouch:true,isMobile:true});await page.reload();await openTab();
  await page.tap('#cpNew');await page.waitForSelector('#entryBox:not(.hidden)');await sleep(250);
  let c=await cls();
  ok('at 390 px with a touch screen it is a full-width sheet above the bottom edge',c.sheet&&c.r.width>=c.w-20&&c.r.width<=640&&c.r.bottom<=844);
  await page.click('#enCancel');
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});await page.reload();await openTab();
  await openNew();await sleep(250);c=await cls();
  ok('with a mouse at 1280 px it floats, not a sheet',!c.sheet&&c.r.width<700);
  await page.screenshot({path:join(shots,'float.png')});await page.click('#enCancel');
}
/* ---------- end of the entry sheet ---------- */

/* ---------- paste ---------- */
async function testPaste(){
}
/* ---------- end of paste ---------- */

/* ---------- delete, the Trash and backup ---------- */
async function testTrash(){
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
