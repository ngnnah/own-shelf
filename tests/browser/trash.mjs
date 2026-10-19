// The Trash: removed books, highlights and notes wait 30 days and can be restored. Usage: node tests/browser/trash.mjs [repo dir]
// Screenshots of the Settings row and the Trash dialog, light and dark, go to tests/browser/out/trash/.
import {start,enterLocalMode,addQuietEngine,highlightQuietEngine,addMarkdown,sleep,waitForFile} from './lib.mjs';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('trash',8127);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','trash');mkdirSync(shots,{recursive:true});
const shot=async label=>{await until(()=>!document.querySelector('#toast').classList.contains('on'));await sleep(300);await page.screenshot({path:join(shots,label+'.png')});};

// The local adapter's IndexedDB, read and written directly
const keys=()=>page.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,q=db.transaction('kv').objectStore('kv').getAllKeys();q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}));
const putRaw=entries=>page.evaluate(entries=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('kv','readwrite');for(const [k,v] of entries)tx.objectStore('kv').put(v,k);tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>rej(tx.error);};}),entries);
// the app doesn't await its writes: poll until the keys match
async function keysUntil(fn){for(let i=0;i<50;i++){const k=await keys();if(fn(k))return k;await sleep(100);}return keys();}
const n=(k,prefix)=>k.filter(x=>x.startsWith(prefix)).length;

const toast=()=>text('#toast');
const count=()=>text('#hlCount');
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
const rows=()=>page.$$eval('#trashList .tr-row',els=>els.map(e=>({what:e.querySelector('.sec b').textContent,sec:e.querySelector('.sec').textContent,text:e.textContent.replace(/\s+/g,' ')})));
async function toShelf(){if(!(await vis('#shelf'))){await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');}}
async function openSettings(){
  await toShelf();await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  await until(()=>document.querySelector('#trashN').textContent!=='Trash');
  return text('#trashN');
}
// Settings → Trash. Returns the label the Settings row showed.
async function openTrash(){
  const label=await openSettings();
  await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');
  await until(()=>!document.querySelector('#trashList').textContent.includes('Opening'));
  return label;
}
async function restore(i=0){
  const before=(await rows()).length;
  await page.click(`#trashList .tr-row:nth-child(${i+1}) [data-a="restore"]`);
  await until(n=>document.querySelectorAll('#trashList .tr-row').length===n-1,before);
}
async function closeTrash(){await page.click('#trashM [data-cancel]');await hidden('#trashM');}
async function openBook(title){await toShelf();await page.click(`.cover[aria-label^="${title}"]`);await t.reader();}
const openQuiet=()=>openBook('The Quiet Engine');
async function removeBook(title,typed){
  await toShelf();await page.click(`.c-more[aria-label="Details for ${title}"]`);await page.waitForSelector('#detM:not(.hidden)');
  await page.click('#dRemove');
  if(typed){await page.waitForSelector('#confirmM:not(.hidden)');await page.type('#cfInput','yes');await page.click('#cfGo');}
  else await page.click('#dRemove'); // no highlights: tap twice
  await hidden('#detM');
}
async function setNote(card,value){
  await page.click(card+' [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  await page.$eval('#noteTa',(e,v)=>{e.value=v;},value);await page.click('#noteSave');await hidden('#noteBox');
}

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addQuietEngine(t,must);
  await highlightQuietEngine(t,must); // 2 mint highlights: a paragraph (toolbar), then two list items

  // one highlight, through the toolbar's Remove
  const pText=(await page.$eval('#col p.hp mark.hl',e=>e.textContent)).replace(/\s+/g,' ').trim();
  await page.click('#col p.hp mark.hl');await until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.click('#tool [data-a="del"]');await until(()=>document.querySelector('#hlCount').textContent==='1');
  ok('the toolbar Remove moves the highlight to the Trash',(await count())==='1'&&(await toast())==='Moved to Trash'&&!(await page.$('#col p.hp mark.hl')));
  let label=await openTrash(),r=await rows();
  ok('Settings shows "Trash · 1 item"',label==='Trash · 1 item');
  ok('the Trash lists the highlight with its book, quote and time left',r.length===1&&r[0].what==='Highlight'&&r[0].sec.includes('The Quiet Engine')&&r[0].text.includes(pText.slice(0,40))&&r[0].text.includes('deleted just now · 30 days left'));
  await restore(0);
  ok('Restore empties the Trash',(await toast())==='Restored'&&(await text('#trashList')).includes('The Trash is empty')&&!(await vis('#trashEmpty')));
  await closeTrash();
  ok('the shelf counts the highlight again',(await text('.cover .c-f')).includes('✎ 2'));
  await openQuiet();
  ok('the highlight is back in the reader',(await count())==='2'&&!!(await page.$('#col p.hp mark.hl')));

  // Clear all: one entry for all of them
  await t.openDrawer('#bHl','#drawer');
  await page.click('#clearAll');await page.waitForSelector('#confirmM:not(.hidden)');
  ok('Clear all still asks for "yes" and says where they go',(await text('#cfBody')).includes('2 highlights')&&(await text('#cfBody')).includes('restore them for 30 days'));
  await page.type('#cfInput','yes');await page.click('#cfGo');await hidden('#confirmM');
  ok('Clear all moves them to the Trash',(await count())==='0'&&(await toast())==='Moved to Trash');
  await t.closeDrawer();
  label=await openTrash();r=await rows();
  ok('one Trash entry holds both highlights',label==='Trash · 1 item'&&r.length===1&&r[0].what==='2 highlights');
  await restore(0);await closeTrash();await openQuiet();
  ok('Restore brings both back',(await count())==='2'&&(await page.$$('mark.hl')).length>=3);

  // a cleared note
  const card='#drList .hcard:first-child';
  await t.openDrawer('#bHl','#drawer');
  await setNote(card,'Why this matters');
  must('note saved',(await text(card+' .nt'))==='Why this matters');
  await setNote(card,'');
  ok('clearing a note moves it to the Trash',(await toast())==='Moved to Trash'&&!(await page.$('#drList .nt')));
  await t.closeDrawer();
  label=await openTrash();r=await rows();
  ok('the Trash shows the note and the passage it was on',label==='Trash · 1 item'&&r[0].what==='Note'&&r[0].text.includes('Why this matters')&&r[0].text.includes(pText.slice(0,40)));
  await restore(0);await closeTrash();await openQuiet();
  await t.openDrawer('#bHl','#drawer');
  ok('Restore puts the note back',(await page.$$eval('#drList .nt',els=>els.map(e=>e.textContent))).join('|')==='Why this matters');
  // restored onto a highlight that has a newer note: it goes on a new line under it
  await setNote(card,'');await setNote(card,'A newer note');
  await t.closeDrawer();await openTrash();await restore(0);await closeTrash();await openQuiet();
  await t.openDrawer('#bHl','#drawer');
  ok('a restored note goes under a newer one',(await text(card+' .nt'))==='A newer note\nWhy this matters');
  await t.closeDrawer();

  // a book with highlights
  await toShelf();await page.click('.book .c-more');await page.waitForSelector('#detM:not(.hidden)');
  await page.click('#dRemove');await page.waitForSelector('#confirmM:not(.hidden)');
  ok('removing a book with highlights asks for "yes" and says where it goes',(await text('#cfBody')).includes('2 highlights and 1 note')&&(await text('#cfBody')).includes('restore them for 30 days'));
  await page.type('#cfInput','yes');await page.click('#cfGo');await hidden('#detM');
  let k=await keysUntil(k=>!n(k,'meta:'));
  ok('the book leaves the shelf',(await toast())==='Moved to Trash'&&(await page.$$('.book')).length===0);
  ok('only its shelf entry is deleted',!n(k,'meta:')&&n(k,'doc:')===1&&n(k,'state:')===1);
  label=await openTrash();r=await rows();
  ok('the Trash lists the book with its author and counts',label==='Trash · 1 item'&&r[0].what==='Book'&&r[0].sec.includes('The Quiet Engine')&&r[0].text.includes('Ada Rivers · 2 highlights and 1 note'));
  await restore(0);await closeTrash();
  ok('Restore puts the book back on the shelf with its highlights',(await page.$$('.book')).length===1&&(await text('.cover .c-f')).includes('✎ 2'));
  await openQuiet();
  ok('and in the reader',(await count())==='2');

  // several kinds at once, for the screenshots: a highlight, a note, a book
  await t.openDrawer('#bHl','#drawer');
  await page.click('#drList .hcard:nth-child(2) [data-a="del"]');await until(()=>document.querySelector('#hlCount').textContent==='1');
  ok('a drawer card’s Remove moves it to the Trash',(await toast())==='Moved to Trash'&&(await page.$$('#drList .hcard')).length===1);
  await setNote(card,'');
  await t.closeDrawer();
  await addMarkdown(t,'field-notes.md','# Field Notes\n\nBy June Park\n\n'+'Every tool leaves a mark on the hand that holds it. '.repeat(6)+'\n\n'+'The second paragraph is filler for the body of the text. '.repeat(20)+'\n','Field Notes');
  await t.select('#col p.hp');await page.click('#tool [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  await page.type('#noteTa','Ask June about the workshop');await page.click('#noteSave');
  await removeBook('Field Notes',true);
  label=await openSettings();
  ok('Settings counts 3 items',label==='Trash · 3 items');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await shot('settings-light');
  await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');
  await until(()=>document.querySelectorAll('#trashList .tr-row').length===3);
  r=await rows();
  ok('the Trash lists them newest first',r.map(x=>x.what).join()==='Book,Note,Highlight');
  ok('a book row shows its author and counts',r[0].text.includes('June Park · 1 highlight and 1 note'));
  ok('a quote across blocks joins them with " … "',/\S … \S/.test(r[2].text));
  await shot('trash-light');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  await shot('trash-dark');
  await closeTrash();await openSettings();await shot('settings-dark');
  await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');await until(()=>document.querySelectorAll('#trashList .tr-row').length===3);
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);

  // Delete forever, on the book: its content goes too
  const book='#trashList .tr-row:first-child [data-a="forget"]';
  await page.click(book);
  ok('Delete forever asks for a second tap',(await text(book))==='Tap again to delete'&&(await rows()).length===3);
  await page.click(book);
  await until(()=>document.querySelectorAll('#trashList .tr-row').length===2);
  k=await keysUntil(k=>n(k,'doc:')===1);
  ok('Delete forever removes the entry, the book and its state',(await toast())==='Deleted for good'&&(await rows()).length===2&&n(k,'doc:')===1&&n(k,'state:')===1&&n(k,'trash:')===2);

  // Empty Trash needs "yes"
  await page.click('#trashEmpty');await page.waitForSelector('#confirmM:not(.hidden)');
  ok('Empty Trash asks for "yes"',(await text('#cfH'))==='Empty the Trash?'&&(await text('#cfBody')).includes('2 items')&&await page.$eval('#cfGo',e=>e.disabled));
  ok('the question shows above the Trash',await page.evaluate(()=>{const d=document.querySelector('#confirmM .dlg').getBoundingClientRect();return !!document.elementFromPoint(d.left+d.width/2,d.top+d.height/2).closest('#confirmM');}));
  await page.type('#cfInput','no');
  ok('anything but "yes" keeps it disabled',await page.$eval('#cfGo',e=>e.disabled));
  await shot('empty-confirm-light');
  await page.click('#confirmM [data-cancel]');await hidden('#confirmM');
  ok('Cancel keeps everything',await vis('#trashM')&&(await rows()).length===2&&n(await keys(),'trash:')===2);
  await page.click('#trashEmpty');await page.waitForSelector('#confirmM:not(.hidden)');
  await page.type('#cfInput','yes');await page.click('#cfGo');await hidden('#confirmM');
  k=await keysUntil(k=>!n(k,'trash:'));
  ok('"yes" empties the Trash for good',(await toast())==='Trash emptied'&&(await text('#trashList')).includes('The Trash is empty')&&!n(k,'trash:'));
  await shot('trash-empty-light');
  await closeTrash();

  // a highlight restored while its book is in the Trash goes into the book's stored state
  await openQuiet();
  await t.openDrawer('#bHl','#drawer');
  await page.click(card+' [data-a="del"]');await until(()=>document.querySelector('#hlCount').textContent==='0');
  await t.closeDrawer();
  await removeBook('The Quiet Engine',false);
  await openTrash();r=await rows();
  must('book and highlight in the Trash',r.map(x=>x.what).join()==='Book,Highlight');
  await restore(1);
  ok('a highlight restores while its book is still in the Trash',(await toast())==='Restored'&&(await page.$$('.book')).length===0&&(await rows()).length===1);
  await restore(0);await closeTrash();
  ok('the book comes back with that highlight',(await page.$$('.book')).length===1&&(await text('.cover .c-f')).includes('✎ 1'));

  // adding the same text again while its old copy is in the Trash
  await removeBook('The Quiet Engine',true);
  must('book in the Trash',n(await keysUntil(k=>n(k,'trash:')===1),'trash:')===1);
  await addQuietEngine(t,must);
  k=await keysUntil(k=>!n(k,'trash:'));
  ok('adding it again takes the old copy out of the Trash',!n(k,'trash:')&&n(k,'meta:')===1);

  // restoring a backup that has a book now in the Trash: the book is back, so it leaves the Trash
  await openSettings();await page.click('#backupBtn');
  const bk=await waitForFile(t.dl,/^own-shelf-backup-.*\.json$/);
  must('backup saved',!!bk);
  await page.click('#setM [data-cancel]');await hidden('#setM');
  await removeBook('The Quiet Engine',false);
  must('book in the Trash',n(await keysUntil(k=>n(k,'trash:')===1),'trash:')===1);
  await openSettings();await (await page.$('#restoreFile')).uploadFile(join(t.dl,bk));
  await until(()=>document.querySelector('#toast').textContent.startsWith('Restored'));
  k=await keysUntil(k=>!n(k,'trash:'));
  ok('restoring a backup takes a book it brings back out of the Trash',(await page.$$('.book')).length===1&&!n(k,'trash:'));

  // the 30-day purge, at start
  const now=Date.now(),day=864e5;
  await putRaw([
    ['trash:hOld',{id:'hOld',kind:'highlights',deletedAt:now-31*day,bookId:'zzold',title:'An old book',items:[{id:'hx',color:'sun',note:'',segs:[{pid:'p1',s:0,e:4}],at:now-40*day}],quote:'An old quote'}],
    ['trash:bOld',{id:'bOld',kind:'book',deletedAt:now-30*day-6e4,bookId:'zzold',title:'An old book',meta:{id:'zzold',title:'An old book',author:'Nobody',color:2},hl:1,notes:0}],
    ['doc:zzold',{id:'zzold',title:'An old book',blocks:[],sections:[],notes:[]}],
    ['state:zzold',{hl:[],pos:0,maxP:0,done:[]}],
    ['trash:nNew',{id:'nNew',kind:'note',deletedAt:now-29*day,bookId:'zzgone',title:'A book deleted for good',hlId:'hy',text:'A recent note',quote:'A recent quote',color:'sky'}]
  ]);
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
  const old=['trash:hOld','trash:bOld','doc:zzold','state:zzold'];
  k=await keysUntil(k=>!old.some(x=>k.includes(x)));
  ok('the purge deletes entries older than 30 days, with a book’s content',!old.some(x=>k.includes(x)));
  ok('and keeps newer ones',k.includes('trash:nNew'));
  label=await openTrash();r=await rows();
  ok('a 29-day-old entry has 1 day left',label==='Trash · 1 item'&&r[0].text.includes('deleted 29 days ago · 1 day left'));
  await page.click('#trashList .tr-row [data-a="restore"]');
  await until(()=>document.querySelector('#toast').textContent.startsWith('Can’t restore'));
  ok('an entry whose book is gone says it can’t be restored, and stays',(await toast()).includes('deleted for good')&&(await rows()).length===1);
});
