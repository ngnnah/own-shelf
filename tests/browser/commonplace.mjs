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
