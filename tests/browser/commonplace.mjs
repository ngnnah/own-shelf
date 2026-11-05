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
  const tst=()=>text('#toast'),rows=()=>page.$$eval('#trashList .tr-row',els=>els.map(e=>e.textContent.replace(/\s+/g,' ')));
  const openTrash=async()=>{await page.keyboard.press('Escape');if(await vis('#notebook')){await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');}
    await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');
    await until(()=>!document.querySelector('#trashList').textContent.includes('Opening'));};
  const delFirst=async()=>{await page.waitForSelector('#cpList .cp-card');await sleep(300);await page.click('#cpList .cp-card');await page.waitForSelector('#entryBox:not(.hidden)');await page.click('#enDel');};
  const E1=entry('tr1','  \nFirst line of a trash note\nsecond line #lesson','2026-10-03');
  await putEntries([E1]);await openTab();
  await delFirst();
  await until(()=>document.querySelectorAll('#cpList .cp-card').length===0);
  ok('Delete moves the entry to the Trash: card and stored entry go',(await tst())==='Moved to Trash · Undo'&&!(await storedEntries()).tr1);
  await page.click('#toast button');await until(()=>document.querySelectorAll('#cpList .cp-card').length===1);
  ok('Undo brings it back as it was',same((await storedEntries()).tr1,E1)&&(await cardIds()).join()==='tr1');
  await delFirst();await until(()=>document.querySelectorAll('#cpList .cp-card').length===0);
  await sleep(300);await openTrash();
  const r1=await rows();
  ok('the Trash lists "Entry · <first line>" with the text and date',r1.length===1&&r1[0].includes('Entry · First line of a trash note')&&r1[0].includes('second line #lesson')&&r1[0].includes('October 3, 2026'));
  await page.click('#trashList [data-a="restore"]');await until(()=>document.querySelectorAll('#trashList .tr-row').length===0);
  ok('Restore puts it back',same((await storedEntries()).tr1,E1));
  await page.keyboard.press('Escape');await openTab();
  ok('… and the card shows',(await cardIds()).join()==='tr1');
  await delFirst();await until(()=>document.querySelectorAll('#cpList .cp-card').length===0);
  await sleep(300);await openTrash();await page.waitForSelector('#trashList [data-a="forget"]');await page.click('#trashList [data-a="forget"]');await page.click('#trashList [data-a="forget"]');
  await until(()=>document.querySelectorAll('#trashList .tr-row').length===0);
  await sleep(300);
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
  let bk;for(let i=0;i<50&&!bk;i++){await sleep(100);bk=fs.readdirSync(t.dl).find(f=>f.startsWith('own-shelf-backup')&&!f.endsWith('.crdownload'));}
  ok('Back up shelf writes a file',!!bk);
  const data=JSON.parse(fs.readFileSync(path.join(t.dl,bk),'utf8'));
  ok('… holding the entries',(data.entries||[]).map(e=>e.id).sort().join()==='tr2,tr3');
  await page.keyboard.press('Escape');
  await putEntries([{...E3,text:'Edited later, newer text',up:E3.up+5e6}]);
  await clearEntriesById(['tr2']);
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  await (await page.$('#restoreFile')).uploadFile(path.join(t.dl,bk));
  await until(()=>document.querySelector('#setM').classList.contains('hidden'));
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
