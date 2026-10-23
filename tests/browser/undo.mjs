// Undo after a delete: "Moved to Trash · Undo" for each delete kind (a highlight through the toolbar and through a
// drawer card, Clear all, Remove from shelf, a cleared note, a deleted word), the toast's lifetime (6 s, held while
// hovered or focused), Tab reaching Undo, a second delete replacing the toast, Escape, and no Undo after Delete forever
// or Empty Trash. The dictionary is mocked. Usage: node tests/browser/undo.mjs [repo dir]
// Screenshots of the toast (in the reader above the docked toolbar, and on the shelf; 390×844 and 1280×900, light and
// dark) go to tests/browser/out/undo/.
import {start,enterLocalMode,addQuietEngine,highlightQuietEngine,addMarkdown,sleep} from './lib.mjs';
import {wordId} from '../../vocab.js';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('undo',8146);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','undo');mkdirSync(shots,{recursive:true});

// the word card looks meanings up: answer for the dictionaries
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
page.on('request',req=>{
  const h=new URL(req.url()).hostname,json=(status,body)=>req.respond({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  if(h==='api.datamuse.com') return json(200,[{word:'taciturn',defs:['adj\tReserved; saying little.']}]);
  if(h==='en.wiktionary.org'||h==='en.wikipedia.org') return json(404,{});
  req.continue();
});

/* ---------- helpers ---------- */
// The local adapter's IndexedDB, read directly; the app doesn't await its writes, so poll.
const idb=(fn,arg)=>page.evaluate((fn,arg)=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,s=db.transaction('kv').objectStore('kv'),q=fn==='keys'?s.getAllKeys():s.get(arg);q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}),fn,arg);
async function trashIs(n){let k=0;for(let i=0;i<50;i++){k=(await idb('keys')).filter(x=>x.startsWith('trash:')).length;if(k===n)return true;await sleep(100);}return false;}

const count=()=>text('#hlCount');
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
const toast=()=>page.$eval('#toast',e=>({on:e.classList.contains('on'),text:e.textContent,undo:e.querySelector('button')?.textContent||'',
  act:e.classList.contains('act'),role:e.getAttribute('role'),focus:e.contains(document.activeElement)}));
const settled=()=>page.waitForFunction(()=>!document.querySelector('#toast').getAnimations().length);
const away=()=>page.mouse.move(5,420); // off the toast, so hovering doesn't hold it
const toastGone=(ms=10000)=>page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('on'),{timeout:ms,polling:50}).then(()=>true,()=>false);
async function undo(){await settled();await page.click('#toast button');return until(()=>document.querySelector('#toast').textContent==='Restored');}

// From the reader, wait out its position save (400 ms after a scroll): openBook sets DOC before it has read ST, so
// that timer firing while the next book opens would throw.
async function toShelf(){
  if(await vis('#shelf')) return;
  const reader=await vis('#reader');
  await page.click(await vis('#notebook')?'#nbBack':'#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  if(reader) await sleep(450);
}
async function openBook(title){await toShelf();await page.click(`.cover[aria-label^="${title}"]`);await t.reader();}
const openQuiet=()=>openBook('The Quiet Engine');
const shelfCount=title=>page.$eval(`.cover[aria-label^="${title}"] .c-f`,e=>e.textContent).catch(()=>null);
// a highlight's Remove in the toolbar
async function toolRemove(mark='#col p.hp mark.hl'){
  const before=await count();
  await page.$eval(mark,e=>e.scrollIntoView({block:'center'})); // clear of a toast at the bottom
  await page.click(mark);await until(()=>!!document.querySelector('#tool:not(.hidden) [data-a="del"]'));
  await page.click('#tool [data-a="del"]');await until(b=>document.querySelector('#hlCount').textContent!==b,before);
}
async function setNote(card,value){
  await page.click(card+' [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  await page.$eval('#noteTa',(e,v)=>{e.value=v;},value);await page.click('#noteSave');await hidden('#noteBox');
}
async function removeBook(title,typed){
  await toShelf();await page.click(`.c-more[aria-label="Details for ${title}"]`);await page.waitForSelector('#detM:not(.hidden)');
  await page.click('#dRemove');
  if(typed){await page.waitForSelector('#confirmM:not(.hidden)');await page.type('#cfInput','yes');await page.click('#cfGo');}
  else await page.click('#dRemove'); // no highlights: tap twice
  await hidden('#detM');
}
async function openTrash(){
  await toShelf();await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');
  await until(()=>!document.querySelector('#trashList').textContent.includes('Opening'));
}
// Settings → Trash → Restore on every row
async function restoreAll(){
  await openTrash();
  for(let n;(n=(await page.$$('#trashList .tr-row')).length);){
    await page.click('#trashList .tr-row:first-child [data-a="restore"]');
    await until(n=>document.querySelectorAll('#trashList .tr-row').length===n-1,n);
  }
  await page.click('#trashM [data-cancel]');await hidden('#trashM');
}
async function openWordsTab(){
  await toShelf();await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  if(await page.$eval('#nbTabWd',e=>e.getAttribute('aria-selected'))!=='true') await page.click('#nbTabWd');
  await until(()=>!document.querySelector('#wdList').textContent.includes('Gathering'));
}
const terms=()=>page.$$eval('#wdList .wcard .w-term',els=>els.map(e=>e.textContent));
// Select one word in the open book and wait for the toolbar.
async function selectWord(word){
  await page.evaluate(word=>{
    const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(word));el.scrollIntoView({block:'center'});
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    for(let n;(n=w.nextNode());){const i=n.data.indexOf(word);if(i<0)continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+word.length);getSelection().removeAllRanges();getSelection().addRange(r);return;}
  },word);
  await until(()=>!!document.querySelector('#tool:not(.hidden) [data-a="word"]'));
}

const NOTES=`# Undo Notes\n\nBy Kit Tester\n\nThe lantern keeper was taciturn at dawn and cheerful by noon.\n\n${'Filler words for the body of the text, read slowly. '.repeat(40)}\n`;

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addQuietEngine(t,must);
  await highlightQuietEngine(t,must); // 2 mint highlights: a paragraph, then two list items

  // 1. a highlight, through the toolbar's Remove
  await toolRemove();
  let s=await toast();
  ok('the toolbar Remove says "Moved to Trash · Undo"',s.on&&s.text==='Moved to Trash · Undo'&&s.undo==='Undo'&&(await count())==='1');
  ok('the toast stays role="status" and doesn’t take focus',s.role==='status'&&!s.focus);
  must('one entry in the Trash',await trashIs(1));
  ok('Undo puts the highlight back in the text',await undo()&&(await count())==='2'&&!!(await page.$('#col p.hp mark.hl')));
  ok('and takes it out of the Trash',await trashIs(0));
  await away();
  let t0=Date.now();await toastGone(5000);
  const plain=Date.now()-t0;
  ok(`an ordinary toast ("Restored") goes after about 2 s (${plain} ms)`,plain<3000);

  // 2. a highlight, through a drawer card's Remove
  await t.openDrawer('#bHl','#drawer');
  await page.click('#drList .hcard:first-child [data-a="del"]');await until(()=>document.querySelector('#hlCount').textContent==='1');
  ok('a drawer card’s Remove offers Undo',(await toast()).undo==='Undo'&&(await page.$$('#drList .hcard')).length===1);
  ok('Undo puts the card back in the drawer',await undo()&&(await page.$$('#drList .hcard')).length===2&&(await count())==='2');
  ok('and the entry leaves the Trash',await trashIs(0));

  // 3. Clear all, after typing "yes"
  await page.click('#clearAll');await page.waitForSelector('#confirmM:not(.hidden)');
  await page.type('#cfInput','yes');await page.click('#cfGo');await hidden('#confirmM');
  must('all cleared',await until(()=>document.querySelector('#hlCount').textContent==='0'));
  ok('Clear all offers Undo',(await toast()).text==='Moved to Trash · Undo');
  ok('Undo brings every highlight back',await undo()&&(await count())==='2'&&(await page.$$('#drList .hcard')).length===2&&(await page.$$('mark.hl')).length>=3);
  ok('and empties the Trash',await trashIs(0));

  // 4. a cleared note
  const card='#drList .hcard:first-child';
  await setNote(card,'Worth keeping');await setNote(card,'');
  ok('clearing a note offers Undo',(await toast()).text==='Moved to Trash · Undo'&&!(await page.$('#drList .nt')));
  ok('Undo puts the note back',await undo()&&await until(c=>document.querySelector(c+' .nt')?.textContent==='Worth keeping',card));
  ok('and the entry leaves the Trash',await trashIs(0));
  await t.closeDrawer();

  // 5. lifetime: 6 s, longer than an ordinary toast
  await toolRemove();await away();
  t0=Date.now();
  await sleep(4500);
  ok('an Undo toast is still there after 4.5 s',(await toast()).on);
  await toastGone();
  const life=Date.now()-t0;
  ok(`and goes after about 6 s (${life} ms)`,life>=5500&&life<=7000);
  ok('the entry stays in the Trash',await trashIs(1));
  await restoreAll();await openQuiet();
  must('restored',(await count())==='2');

  // 6. hovering holds it; leaving lets it go a moment later
  await toolRemove();await settled();
  const box=await page.$eval('#toast',e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/3,y:r.y+r.height/2};});
  await page.mouse.move(box.x,box.y);
  await sleep(7000);
  ok('hovering keeps it past 6 s',(await toast()).on);
  await away();t0=Date.now();
  await sleep(800);
  ok('leaving it keeps it a moment',(await toast()).on);
  await toastGone();
  const after=Date.now()-t0;
  ok(`then it goes (${after} ms after leaving)`,after>=1500&&after<=3200);
  await restoreAll();await openQuiet();

  // 7. the keyboard: Tab reaches Undo, focus holds the toast, Enter undoes
  await toolRemove();await away();t0=Date.now();
  ok('a new toast leaves focus where it was',!(await toast()).focus);
  let reached=false;
  for(let i=0;i<300&&!reached;i++){await page.keyboard.press('Tab');reached=await page.evaluate(()=>!!document.activeElement?.closest('#toast'));}
  ok('Tab reaches the Undo button',reached);
  await sleep(Math.max(0,6800-(Date.now()-t0)));
  ok('focus keeps it past 6 s',(await toast()).on);
  await page.keyboard.press('Enter');
  ok('Enter on Undo restores the highlight',await until(()=>document.querySelector('#toast').textContent==='Restored')&&(await count())==='2'&&await trashIs(0));
  ok('and focus leaves the toast',!(await toast()).focus);
  await toastGone();

  // 8. Escape dismisses it without undoing
  await toolRemove();
  must('toast up',(await toast()).undo==='Undo');
  await page.keyboard.press('Escape');
  ok('Escape dismisses the toast',!(await toast()).on);
  ok('and undoes nothing: the highlight stays in the Trash',(await count())==='1'&&await trashIs(1));
  await restoreAll();await openQuiet();

  // 9. a second delete replaces the toast; the first stays in the Trash
  await toolRemove('#col p.hp mark.hl');await toolRemove('.list .li mark.hl');
  s=await toast();
  ok('a second delete replaces the toast',s.on&&s.text==='Moved to Trash · Undo'&&(await count())==='0'&&await trashIs(2));
  await undo();
  ok('its Undo restores only the second delete',(await count())==='1'&&!!(await page.$('.list .li mark.hl'))&&!(await page.$('#col p.hp mark.hl')));
  ok('the first is still in the Trash',await trashIs(1));
  await restoreAll();await openQuiet();
  ok('and restores from there',(await count())==='2'&&!!(await page.$('#col p.hp mark.hl')));

  // 10. Remove from shelf, with the book open (it has highlights: typed "yes")
  await page.$eval('#barTitle',e=>e.click()); // hidden on phones; Details also opens from the shelf
  await page.waitForSelector('#detM:not(.hidden)');
  await page.click('#dRemove');await page.waitForSelector('#confirmM:not(.hidden)');
  await page.type('#cfInput','yes');await page.click('#cfGo');await page.waitForSelector('#shelf:not(.hidden)');
  ok('removing the open book offers Undo on the shelf',(await toast()).text==='Moved to Trash · Undo'&&!(await page.$('.book')));
  ok('Undo puts it back on the shelf with its highlights',await undo()&&await until(()=>!!document.querySelector('.cover[aria-label^="The Quiet Engine"]'))&&(await shelfCount('The Quiet Engine')).includes('✎ 2'));
  ok('and empties the Trash',await trashIs(0));
  await openQuiet();
  ok('the reader has them all',(await count())==='2');

  // 11. a deleted word, from the Notebook's Words tab
  await addMarkdown(t,'undo-notes.md',NOTES,'Undo Notes');
  await selectWord('taciturn');await page.click('#tool [data-a="word"]');await page.waitForSelector('#wordBox:not(.hidden)');
  await page.click('#wbClose');await hidden('#wordBox');
  await openWordsTab();
  must('the word is listed with its meaning',(await terms()).includes('taciturn')&&await until(id=>document.querySelector(`#wdList .wcard[data-id="${id}"] .w-def`).textContent.startsWith('Reserved'),wordId('taciturn')));
  await page.click(`#wdList .wcard[data-id="${wordId('taciturn')}"] [data-a="del"]`);
  ok('deleting a word offers Undo',(await toast()).text==='Moved to Trash · Undo'&&!(await terms()).includes('taciturn'));
  ok('Undo lists it again, with its meaning',await undo()&&await until(()=>[...document.querySelectorAll('#wdList .w-term')].some(e=>e.textContent==='taciturn'))
    &&(await text(`#wdList .wcard[data-id="${wordId('taciturn')}"] .w-def`)).startsWith('Reserved'));
  ok('the word is stored again and the Trash is empty',!!(await idb('get','word:'+wordId('taciturn')))&&await trashIs(0));

  // 12. a book without highlights, from the shelf (two taps)
  await removeBook('Undo Notes',false);
  ok('removing a book offers Undo',(await toast()).text==='Moved to Trash · Undo'&&!(await page.$('.cover[aria-label^="Undo Notes"]')));
  ok('Undo puts it back on the shelf',await undo()&&await until(()=>!!document.querySelector('.cover[aria-label^="Undo Notes"]'))&&await trashIs(0));

  // 13. Delete forever and Empty Trash can't be undone: no Undo
  await openQuiet();await toolRemove();await page.keyboard.press('Escape'); // so the toast can't cover Settings
  await openTrash();
  const forget='#trashList .tr-row:first-child [data-a="forget"]';
  await page.click(forget);await page.click(forget);
  await until(()=>document.querySelector('#toast').textContent==='Deleted for good');
  s=await toast();
  ok('Delete forever: "Deleted for good", no Undo',s.on&&!s.undo&&!s.act&&await trashIs(0));
  await page.click('#trashM [data-cancel]');await hidden('#trashM');
  await openQuiet();await toolRemove('.list .li mark.hl');await page.keyboard.press('Escape');
  await openTrash();await page.click('#trashEmpty');await page.waitForSelector('#confirmM:not(.hidden)');
  await page.type('#cfInput','yes');await page.click('#cfGo');await hidden('#confirmM');
  await until(()=>document.querySelector('#toast').textContent==='Trash emptied');
  s=await toast();
  ok('Empty Trash: "Trash emptied", no Undo',s.on&&!s.undo&&!s.act&&await trashIs(0));
  await page.click('#trashM [data-cancel]');await hidden('#trashM');
  await toastGone();

  // 14. screenshots: in the reader with the toolbar docked (a touch screen), and on the shelf
  for(const [width,height,size] of [[390,844,'phone'],[1280,900,'desktop']]){
    await page.setViewport({width,height,deviceScaleFactor:2,hasTouch:true,isMobile:size==='phone'});
    await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
    for(const theme of ['light','dark']){
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);
      await openBook('Undo Notes');
      if((await count())==='0'){await t.select('#col p.hp');await page.click('#tool [data-c="sky"]');await until(()=>document.querySelector('#hlCount').textContent==='1');}
      // remove the highlight, then select a passage: the toolbar docks at the bottom again, under the toast
      await toolRemove('#col p.hp mark.hl');
      await t.select('#col p.hp');await settled();
      const g=await page.evaluate(()=>{const a=document.querySelector('#toast').getBoundingClientRect(),b=document.querySelector('#tool').getBoundingClientRect();
        return {docked:document.querySelector('#tool').classList.contains('docked'),gap:b.top-a.bottom,left:a.left,right:innerWidth-a.right,h:a.height};});
      ok(`${size} ${theme}: the toast sits on one line above the docked toolbar, inside the screen`,g.docked&&g.gap>=8&&g.left>=16&&g.right>=16&&g.h<60);
      if((await toast()).on) await page.screenshot({path:join(shots,`reader-${size}-${theme}.png`)});
      else ok(`${size} ${theme}: toast still up for the reader screenshot`,false);
      await undo();await page.evaluate(()=>getSelection().removeAllRanges());
      await removeBook('Undo Notes',true);await settled();
      if((await toast()).on) await page.screenshot({path:join(shots,`shelf-${size}-${theme}.png`)});
      else ok(`${size} ${theme}: toast still up for the shelf screenshot`,false);
      await undo();
    }
  }
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
});
