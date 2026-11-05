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
  const closeSheet=async()=>{await page.click('#enCancel');await until(()=>document.querySelector('#entryBox').classList.contains('hidden'));};
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
