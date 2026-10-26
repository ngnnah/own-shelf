// To sort: coral highlights (Kindle red and pink, and Coral made here) become words or fact cards. Tapping
// words, a selected phrase as the blank, Fact, Skip and Show skipped, Make the rest facts, the sorting surviving a
// Kindle re-import, the Facts chip, the Trash, and fact cards in Study. Dictionaries are mocked.
// Usage: node tests/browser/sort.mjs [repo dir]
// Screenshots (To sort, the Facts chip, fact cards in Study; 390×844 and 1280×900, light and dark) go to
// tests/browser/out/sort/.
import {start,enterLocalMode,addMarkdown,sleep,dayKey,readSettings,setStudyLog} from './lib.mjs';
import {wordId,factId} from '../../vocab.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('sort',8142);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','sort');mkdirSync(shots,{recursive:true});

/* ---------- the dictionaries, mocked ---------- */
const DATAMUSE={pilots:[{word:'pilots',defs:['n\tPeople who steer ships into harbour.']}],ledger:[{word:'ledger',defs:['n\tA book of accounts.']}]};
const asked=[];
const json=(req,status,body)=>req.respond({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
page.on('request',req=>{
  const u=new URL(req.url());
  if(u.hostname==='api.datamuse.com'){const w=u.searchParams.get('sp');asked.push(w);return json(req,200,DATAMUSE[w]||[]);}
  if(u.hostname==='en.wiktionary.org'||u.hostname==='en.wikipedia.org') return json(req,404,{});
  req.continue();
});

/* ---------- a synthetic Kindle notebook and a book with a Coral highlight ---------- */
const LONG='The almanac said the tide would turn at dusk, but the old pilots knew better: the water obeyed the moon, not the printers, and a careful sailor read the sky before the page. Every harbour keeps a ledger of drowned certainties, and the wise keep it close to hand.';
const SQUALL='A squall is a sudden, violent gust of wind that comes with rain.';
const BARO='Check the barometer before every crossing.';
const MERC='Mercator drew the world flat so that sailors could steer by straight lines.';
const KEEPER='The lighthouse keeper logged every ship, even the ones that never came.';
const INK='Ink fades; the sea remembers.';
const NEW='A new red line from the second read.';
const WALL='The harbour wall was built from granite quarried on the far shore of the bay, hauled across on flat barges in the calm months, and laid without mortar by masons who learned the trade from their fathers.';
const hl=(color,where,txt)=>`<div class="noteHeading">Highlight(<span class="annotation_${color}">${color}</span>) - ${where}</div><div class="noteText">${txt}</div>`;
const notebook=(extra='')=>`<html><head><meta charset="UTF-8"></head><body><div class="bodyContainer">
<div class="bookTitle">The Salt Almanac</div><div class="authors">Quill, Mara</div>
<div class="sectionHeading">Part One</div>
${hl('red','Tides > Page 3 · Location 40',LONG)}
${hl('yellow','Tides > Page 4 · Location 60','A yellow line, so not one to sort.')}
${hl('orange','Tides > Page 4 · Location 70','An orange line is a quote, so not one to sort either.')}
${hl('pink','Tides > Page 5 · Location 80',SQUALL)}
${hl('red','Tides > Page 6 · Location 100',BARO)}<div class="noteHeading">Note - Tides > Page 6 · Location 100</div><div class="noteText">Grandpa’s rule.</div>
<div class="sectionHeading">Part Two</div>
${hl('red','Charts > Page 9 · Location 150',MERC)}
${hl('red','Charts > Page 10 · Location 170',KEEPER)}
${hl('red','Charts > Page 11 · Location 190',INK)}${extra}
</div></body></html>`;
const BOOK=`# Harbour Notes\n\nBy June Park\n\n${WALL}\n\n${'Filler words for the body of the text, read slowly. '.repeat(20)}\n`;

/* ---------- helpers ---------- */
const file=(name,body)=>{const p=join(t.tmp,name);writeFileSync(p,body);return p;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// the local adapter's IndexedDB, read directly; the app doesn't wait for its writes, so poll
const idb=key=>page.evaluate(key=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,q=db.transaction('kv').objectStore('kv').get(key);q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}),key);
async function poll(key,fn=v=>!!v){let v;for(let i=0;i<50;i++){v=await idb(key);if(fn(v))return v;await sleep(100);}return v;}
// a book's highlight whose first block starts with `start`, from storage
async function hlOf(book,start,fn=()=>true){
  for(let i=0;i<50;i++){
    const d=await idb('doc:'+book),s=await idb('state:'+book);
    const h=d&&s&&s.hl.find(h=>{const b=d.blocks.find(b=>b.id===h.segs[0].pid);return b&&b.text.slice(h.segs[0].s).startsWith(start);});
    if(h&&fn(h)) return h;await sleep(100);
  }
}
const toast=s=>until(s=>document.querySelector('#toast').textContent===s,s);
async function toShelf(){if(!(await vis('#shelf'))){await page.click(await vis('#notebook')?'#nbBack':await vis('#study')?'#syBack':'#bHome');await page.waitForSelector('#shelf:not(.hidden)');}}
async function pick(path){
  await toShelf();await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  await (await page.$('#file')).uploadFile(path);
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));
  await page.click('#impGo');await t.reader();
}
async function openWords(){
  await toShelf();await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  if(await page.$eval('#nbTabWd',e=>e.getAttribute('aria-selected'))!=='true') await page.click('#nbTabWd');
  await until(()=>[...document.querySelectorAll('#wdChips .chip')].some(b=>/^To sort \(/.test(b.textContent)));
}
const chips=()=>page.$$eval('#wdChips .chip',b=>b.map(x=>x.textContent));
const pressed=()=>page.$eval('#wdChips [aria-pressed="true"]',b=>b.textContent);
const chip=label=>page.evaluate(l=>[...document.querySelectorAll('#wdChips .chip')].find(b=>b.textContent.startsWith(l)).click(),label);
const sortCount=n=>until(n=>[...document.querySelectorAll('#wdChips .chip')].some(b=>b.textContent===`To sort (${n})`),n);
const listed=()=>page.$$eval('#wdList .scard .st-text',els=>els.map(e=>e.textContent));
// a To sort card, by the start of its text
const card=start=>page.evaluate(start=>{
  const c=[...document.querySelectorAll('#wdList .scard')].find(c=>c.querySelector('.st-text').textContent.startsWith(start));if(!c) return null;
  return {key:c.dataset.k,sec:c.querySelector('.sec').textContent,on:[...c.querySelectorAll('.st-w.on')].map(x=>x.textContent),gap:c.querySelector('.f-gap')?.textContent||'',
    info:c.querySelector('.sc-info').textContent,acts:[...c.querySelectorAll('.sc-acts button')].map(b=>b.textContent),note:c.querySelector('.f-note')?.textContent||'',
    size:parseFloat(getComputedStyle(c.querySelector('.st-text')).fontSize)};
},start);
const act=async(start,st)=>{const c=await card(start);await page.click(`#wdList .scard[data-k="${c.key}"] [data-st="${st}"]`);};
// tap a word in a card, as a finger would: the middle of the word
async function tap(start,word){
  const at=await page.evaluate((start,word)=>{
    const c=[...document.querySelectorAll('#wdList .scard')].find(c=>c.querySelector('.st-text').textContent.startsWith(start));
    const w=[...c.querySelectorAll('.st-w')].find(x=>x.textContent===word);w.scrollIntoView({block:'center'});
    const r=w.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
  },start,word);
  await page.mouse.click(at.x,at.y);
}
const chosen=(start,want)=>until((start,want)=>{const c=[...document.querySelectorAll('#wdList .scard')].find(c=>c.querySelector('.st-text').textContent.startsWith(start));
  return c&&JSON.stringify([...c.querySelectorAll('.st-w.on')].map(x=>x.textContent))===want;},start,JSON.stringify(want));
// drag the mouse over a card's text: from character `fa` of word `a` to character `zb` of word `b` (both included)
async function drag(start,a,fa,b,zb){
  const p=await page.evaluate((start,a,fa,b,zb)=>{
    const el=[...document.querySelectorAll('#wdList .scard .st-text')].find(e=>e.textContent.startsWith(start));el.scrollIntoView({block:'center'});
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];let n,len=0;while((n=w.nextNode())){nodes.push([n,len]);len+=n.data.length;}
    const box=o=>{const [nd,s]=nodes.find(([nd,s])=>o>=s&&o<s+nd.data.length),r=document.createRange();r.setStart(nd,o-s);r.setEnd(nd,o-s+1);return r.getBoundingClientRect();};
    const full=el.textContent,r1=box(full.indexOf(a)+fa),r2=box(full.indexOf(b)+zb);
    return {x1:r1.left+1,y1:r1.top+r1.height/2,x2:r2.right-1,y2:r2.top+r2.height/2};
  },start,a,fa,b,zb);
  await page.mouse.move(p.x1,p.y1);await page.mouse.down();await page.mouse.move(p.x2,p.y2,{steps:12});await page.mouse.up();
}
const gap=(start,want)=>until((start,want)=>{const c=[...document.querySelectorAll('#wdList .scard')].find(c=>c.querySelector('.st-text').textContent.startsWith(start));
  return c&&(c.querySelector('.f-gap')?.textContent||'')===want;},start,want);
const facts=()=>page.$$eval('#wdList .fcard',cs=>cs.map(c=>({tag:c.querySelector('.f-tag').textContent,q:c.querySelector('.w-q').textContent,gap:c.querySelector('.f-gap')?.textContent||'',
  bk:c.querySelector('.w-bk').textContent,note:c.querySelector('.f-note')?.textContent||''})));
const search=q=>page.$eval('#wdQ',(e,q)=>{e.value=q;e.dispatchEvent(new Event('input',{bubbles:true}));},q);
const noSideScroll=()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth);
// screenshots at phone and desktop size, light and dark; before each, `scroll` (run in the page) places the view
async function shoot(label,scroll,full=false){
  const bad=[];
  await until(()=>!document.querySelector('#toast').classList.contains('on'));await sleep(250);
  await page.mouse.move(1,1); // no hover tint from the last drag
  for(const [w,h] of [[390,844],[1280,900]]) for(const theme of ['light','dark']){
    await page.setViewport({width:w,height:h,deviceScaleFactor:w<500?2:1});
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);
    if(scroll) await page.evaluate(scroll);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    if(!(await noSideScroll())) bad.push(`${label} ${w}px ${theme}: horizontal scroll`);
    await page.screenshot({path:join(shots,`${label}-${w}-${theme}.png`),fullPage:full});
  }
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  if(bad.length) console.log(bad.join('\n'));
  return bad;
}
/* Study */
const setNewToday=n=>setStudyLog(page,{[dayKey()]:{reviews:n,new:n}}); // the day's new cards, in the study log
async function openStudy(){
  await page.goto(t.base+'?study=1',{waitUntil:'networkidle0'});await page.waitForSelector('#study:not(.hidden)');
  await until(()=>!document.querySelector('#syCard').textContent.includes('Gathering'));
}
const sy=()=>page.evaluate(()=>{const q=s=>document.querySelector('#syCard '+s);
  return {prog:document.querySelector('#syProg').textContent,term:q('.sy-term')?.textContent||'',ask:q('.sy-ask')?.textContent||'',sent:q('.sy-sent')?.textContent||'',
    gap:q('.sy-gap')?.textContent||'',fill:q('.sy-fill')?.textContent||'',note:q('.sy-note')?.textContent||'',book:q('.sy-book')?.textContent||'',back:!!q('.sy-back'),
    show:document.querySelector('#syActs [data-sy="show"]')?.textContent||'',rates:document.querySelectorAll('#syActs .sy-r').length};});
const next=prog=>until(p=>document.querySelector('#syProg').textContent===p,prog);
const key=async k=>{await page.keyboard.press(k);await sleep(30);};
const studyShot=label=>shoot(label,()=>scrollTo(0,0));

await t.run(async()=>{
  await enterLocalMode(t,must);

  /* ---------- 1. a Kindle notebook, and a Coral highlight made here ---------- */
  await pick(file('The Salt Almanac - Notebook.html',notebook()));
  must('the notebook is imported',(await text('#hlCount'))==='8');
  const kid=await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:last')));
  ok('Kindle red and pink import as Coral, orange as Quotes (amber)',(await page.$$eval('mark.hl.c-coral',m=>new Set(m.map(x=>x.dataset.h)).size))===6&&(await page.$$eval('mark.hl.c-amber',m=>new Set(m.map(x=>x.dataset.h)).size))===1);
  await addMarkdown(t,'harbour.md',BOOK,'Harbour Notes');
  const hid=await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:last')));
  await page.evaluate(p=>{const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(p));el.scrollIntoView({block:'center'});const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);},WALL);
  await until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.keyboard.press('3');await until(()=>document.querySelector('#hlCount').textContent==='1');
  must('a Coral highlight made here',(await page.$$('mark.hl.c-coral')).length>0);
  await hlOf(hid,WALL); // saved after 500 ms

  /* ---------- 2. the Words tab's chips; To sort ---------- */
  await openWords();
  ok('chips: All · Words · Facts · To sort (7)',same(await chips(),['All','Words','Facts','To sort (7)'])&&(await pressed())==='All');
  ok('the controls show before any word is saved',await vis('#wdCtrl')&&(await text('#wdList')).includes('No words yet'));
  await chip('To sort');await until(()=>document.querySelectorAll('#wdList .scard').length===7);
  ok('To sort lists every Coral highlight, newest book first, then in reading order',same(await listed(),[WALL,LONG,SQUALL,BARO,MERC,KEEPER,INK]));
  let c=await card(LONG);
  ok('each card names its book and section',(await card(WALL)).sec==='Harbour Notes'&&c.sec==='The Salt Almanac · 1. Part One'&&(await card(MERC)).sec==='The Salt Almanac · 2. Part Two');
  ok('a note shows under its highlight',(await card(BARO)).note==='Grandpa’s rule.');
  ok('the text is large enough to tap words',c.size>=19);
  ok('each card offers Skip and Fact',same(c.acts,['Skip','Fact'])&&c.info==='');
  ok('To sort: no horizontal scroll at phone width',await noSideScroll());

  /* ---------- 3. tapping two words in one highlight ---------- */
  await tap(LONG,'pilots');await chosen(LONG,['pilots']);
  await tap(LONG,'ledger');await chosen(LONG,['pilots','ledger']);
  let p=await poll('word:'+wordId('pilots'),w=>w&&w.def),l=await poll('word:'+wordId('ledger'),w=>w&&w.def);
  ok('tapping two words makes two words',!!p&&!!l&&p.term==='pilots'&&l.term==='ledger');
  ok('each with its own sentence from the highlight',p.examples.length===1&&p.examples[0].text==='The almanac said the tide would turn at dusk, but the old pilots knew better: the water obeyed the moon, not the printers, and a careful sailor read the sky before the page.'
    &&l.examples[0].text==='Every harbour keeps a ledger of drowned certainties, and the wise keep it close to hand.'&&l.examples[0].text.slice(l.examples[0].s,l.examples[0].e)==='ledger');
  ok('and their place in the book',p.examples[0].bookId===kid&&p.examples[0].title==='The Salt Almanac'&&LONG.slice(p.examples[0].ws,p.examples[0].we)==='pilots');
  ok('their meanings are looked up',p.def==='People who steer ships into harbour.'&&l.def==='A book of accounts.'&&asked.includes('pilots')&&asked.includes('ledger'));
  c=await card(LONG);
  ok('chosen words show, with Undo; no Skip once a word is chosen',c.info==='Saved: pilots, ledgerUndo'&&same(c.acts,['Fact']));
  ok('the highlight stays listed, sorted as words: To sort (6)',await sortCount(6)&&(await listed()).includes(LONG)&&(await hlOf(kid,LONG,h=>h.study)).study.as==='words');
  await act(LONG,'undo');await chosen(LONG,['pilots']);
  ok('Undo takes back the last word',!(await poll('word:'+wordId('ledger'),w=>!w))&&(await card(LONG)).info==='Saved: pilotsUndo');
  await tap(LONG,'pilots');await chosen(LONG,[]);
  ok('tapping a chosen word takes it back too; with none left, the highlight waits again',!(await poll('word:'+wordId('pilots'),w=>!w))&&await sortCount(7)&&!(await hlOf(kid,LONG,h=>!h.study)).study);
  await tap(LONG,'pilots');await chosen(LONG,['pilots']);await tap(LONG,'ledger');await chosen(LONG,['pilots','ledger']);
  must('both words saved again',await sortCount(6));

  /* ---------- 4. Fact with a selected phrase: a cloze card ---------- */
  await drag(SQUALL,'sudden',2,'gust',1); // from inside "sudden" to inside "gust", soon after a tap
  ok('a selected phrase, stretched to whole words, shows as the blank',await gap(SQUALL,'sudden, violent gust')&&(await card(SQUALL)).info==='Clear blank'&&same((await card(SQUALL)).on,[]));
  await act(SQUALL,'fact');await sortCount(5);
  const sq=await hlOf(kid,SQUALL,h=>h.study);
  let f=await poll('word:'+factId(kid,sq.id));
  ok('Fact makes a fact card with the phrase as its blank',f&&f.kind==='fact'&&f.text===SQUALL&&SQUALL.slice(f.blank.s,f.blank.e)==='sudden, violent gust'&&f.note===''&&!('srs' in f));
  ok('the card knows its highlight and where it’s from',f.bookId===kid&&f.hlId===sq.id&&f.title==='The Salt Almanac'&&f.section==='1. Part One'&&f.pid===sq.segs[0].pid);
  ok('it leaves To sort: To sort (5), sorted as a fact',!(await listed()).includes(SQUALL)&&sq.study.as==='fact'&&(await text('#toast'))==='Made a fact card');

  /* ---------- 5. Fact without a phrase: a re-read card; Clear blank ---------- */
  await act(BARO,'fact');await sortCount(4);
  const ba=await hlOf(kid,BARO,h=>h.study);f=await poll('word:'+factId(kid,ba.id));
  ok('Fact without a phrase: a re-read card with the note',f&&f.blank===null&&f.text===BARO&&f.note==='Grandpa’s rule.'&&ba.study.as==='fact');
  await drag(MERC,'world',0,'flat',3);await gap(MERC,'world flat');
  await act(MERC,'clear');
  ok('Clear blank takes the blank away',await gap(MERC,''));

  /* ---------- 6. Skip, and Show skipped ---------- */
  await act(MERC,'skip');await sortCount(3);
  ok('Skip hides the highlight: To sort (3)',!(await listed()).includes(MERC)&&(await hlOf(kid,MERC,h=>h.study)).study.as==='skip');
  ok('Show skipped appears, with the count',(await text('#wdList [data-st="skipped"]'))==='Show skipped (1)'&&await page.$eval('#wdList [data-st="skipped"]',b=>b.getAttribute('aria-pressed'))==='false');
  await page.click('#wdList [data-st="skipped"]');await until(()=>document.querySelectorAll('#wdList .scard').length===5);
  c=await card(MERC);
  ok('Show skipped lists it again, marked, to sort (no Skip)',!!c&&c.sec.endsWith(' · Skipped')&&same(c.acts,['Fact'])&&await page.$eval('#wdList [data-st="skipped"]',b=>b.getAttribute('aria-pressed'))==='true');
  ok('skipped highlights don’t count as waiting',(await chips())[3]==='To sort (3)');
  await page.click('#wdList [data-st="skipped"]');await until(()=>document.querySelectorAll('#wdList .scard').length===4);
  ok('and hides it again',!(await listed()).includes(MERC));

  /* ---------- 7. screenshots: the long highlight with chosen words and a phrase blanked ---------- */
  await drag(LONG,'drowned',0,'certainties',10);
  must('the long highlight has a blank',await gap(LONG,'drowned certainties'));
  ok('chosen words and the blank show together',same((await card(LONG)).on,['pilots','ledger']));
  ok('To sort screenshots: no horizontal scroll',!(await shoot('tosort',()=>{const b=document.querySelector('#wdList .st-bar');scrollTo(0,b.getBoundingClientRect().top+scrollY-12);})).length);

  /* ---------- 8. Make the rest facts ---------- */
  await page.click('#wdList [data-st="rest"]');await page.waitForSelector('#confirmM:not(.hidden)');
  const dlg=await page.evaluate(()=>({h:document.querySelector('#cfH').textContent,go:document.querySelector('#cfGo').textContent,disabled:document.querySelector('#cfGo').disabled,
    danger:document.querySelector('#cfGo').classList.contains('danger'),typing:!document.querySelector('#cfInput').closest('label').classList.contains('hidden')}));
  ok('Make the rest facts asks with a plain count, no typed "yes"',dlg.h==='Make 3 highlights fact cards?'&&dlg.go==='Make fact cards'&&!dlg.disabled&&!dlg.typing&&!dlg.danger);
  await page.click('#confirmM [data-cancel]');await until(()=>document.querySelector('#confirmM').classList.contains('hidden'));
  ok('Cancel changes nothing',(await chips())[3]==='To sort (3)'&&(await listed()).length===4);
  await page.click('#wdList [data-st="rest"]');await page.waitForSelector('#confirmM:not(.hidden)');
  await page.click('#cfGo');await sortCount(0);
  const rest=[[hid,WALL],[kid,KEEPER],[kid,INK]];let made=[];
  for(const [b,s] of rest){const h=await hlOf(b,s,h=>h.study);made.push([h,await poll('word:'+factId(b,h.id))]);}
  ok('the rest become re-read fact cards',made.every(([h,f])=>h.study.as==='fact'&&f&&f.kind==='fact'&&f.blank===null)&&(await text('#toast'))==='Made 3 fact cards');
  ok('in list order',made[0][1].added<made[1][1].added&&made[1][1].added<made[2][1].added&&made[0][1].title==='Harbour Notes');
  ok('the long highlight, sorted as words, stays listed until leaving',same(await listed(),[LONG]));
  await chip('All');await chip('To sort');
  ok('leaving To sort ends the visit: all sorted, Show skipped left',(await text('#wdList')).includes('All sorted.')&&(await text('#wdList [data-st="skipped"]'))==='Show skipped (1)'&&!(await page.$('#wdList [data-st="rest"]')));

  /* ---------- 9. the sorting survives a re-import of the notebook ---------- */
  await hlOf(kid,INK,h=>h.study); // the last write has landed
  const st0=(await idb('state:'+kid)).hl.filter(h=>h.study).map(h=>[h.id,h.study.as]);
  must('six of the notebook’s highlights sorted',st0.length===6);
  await pick(file('The Salt Almanac - Notebook (again).html',notebook()));
  ok('the same notebook again: no new highlights',await toast('No new highlights — opening it'));
  await openWords();
  ok('…and nothing waits in To sort',(await chips())[3]==='To sort (0)');
  await pick(file('The Salt Almanac - Notebook (newer).html',notebook(hl('red','Charts > Page 12 · Location 210',NEW))));
  ok('a newer export merges one new highlight',await toast('Merged: 1 new highlight'));
  const st1=(await idb('state:'+kid)).hl;
  ok('the merge keeps every highlight’s sorting',same(st1.filter(h=>h.study).map(h=>[h.id,h.study.as]),st0)&&st1.length===9);
  await openWords();await chip('To sort');await until(()=>document.querySelectorAll('#wdList .scard').length===1);
  ok('only the new passage waits in To sort',(await chips())[3]==='To sort (1)'&&same(await listed(),[NEW]));

  /* ---------- 10. the Facts chip ---------- */
  await chip('Facts');await until(()=>document.querySelectorAll('#wdList .fcard').length===5);
  let fs=await facts();
  ok('Facts lists the fact cards, newest first, labelled Fact',fs.length===5&&fs.every(x=>x.tag==='Fact')&&same(fs.map(x=>x.q),[INK,KEEPER,WALL,BARO,SQUALL])&&!(await page.$('#wdList .w-term')));
  const fsq=fs.find(x=>x.q===SQUALL);
  ok('a cloze card shows its blanked phrase marked; its book and section open the highlight',fsq.gap==='sudden, violent gust'&&fsq.bk==='The Salt Almanac · 1. Part One');
  ok('a re-read card shows its note',fs.find(x=>x.q===BARO).note==='Grandpa’s rule.'&&fs.find(x=>x.q===WALL).bk==='Harbour Notes');
  ok('the count line: words and facts; the Progress panel counts all 7 cards',(await text('#wdStats'))==='2 words · 5 facts'&&(await text('#wpFigs [data-k="total"] dd'))==='7');
  await chip('Words');
  ok('Words lists only the words',same(await page.$$eval('#wdList .wcard .w-term',e=>e.map(x=>x.textContent)),['ledger','pilots'])&&!(await page.$('#wdList .fcard')));
  await chip('All');
  ok('All lists both',(await page.$$('#wdList .fcard')).length===5&&(await page.$$('#wdList .w-term')).length===2);
  await chip('Facts');await search('barometer');
  ok('search finds a fact by its text',same((await facts()).map(x=>x.q),[BARO]));
  await search('grandpa');
  ok('…and by its note',same((await facts()).map(x=>x.q),[BARO]));
  await search('');
  await page.select('#wdBook',hid);
  ok('the book filter',same((await facts()).map(x=>x.q),[WALL]));
  await page.select('#wdBook','');
  ok('Facts screenshots: no horizontal scroll',!(await shoot('facts',()=>scrollTo(0,0),true)).length);
  await page.evaluate(q=>[...document.querySelectorAll('#wdList .fcard .w-ex')].find(b=>b.textContent.startsWith(q)).click(),SQUALL);await t.reader();
  await until(h=>document.querySelector(`mark[data-h="${h}"].flash`),sq.id);
  const spot=await page.$eval(`mark[data-h="${sq.id}"]`,m=>{const r=m.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&m.classList.contains('flash');});
  ok('a fact’s book line opens its highlight, scrolled to and flashed',(await text('.hero h1')).includes('Salt')&&spot);

  /* ---------- 11. delete a fact card: the Trash; its highlight stays sorted ---------- */
  await openWords();await chip('Facts');await until(()=>document.querySelectorAll('#wdList .fcard').length===5);
  const inkId=made[2][1].id;
  await page.click(`#wdList .fcard[data-id="${inkId}"] [data-a="del"]`);
  ok('Delete moves a fact card to the Trash',await toast('Moved to Trash · Undo')&&(await facts()).length===4&&!(await poll('word:'+inkId,w=>!w)));
  ok('its highlight doesn’t go back to To sort',(await chips())[3]==='To sort (1)');
  await toShelf();await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');await until(()=>!document.querySelector('#trashList').textContent.includes('Opening'));
  const row=await page.$eval('#trashList .tr-row',e=>({sec:e.querySelector('.sec').textContent,q:e.querySelector('.q').textContent}));
  ok('the Trash lists it as a fact with its book',row.sec==='Fact · The Salt Almanac'&&row.q===INK);
  await page.click('#trashEmpty');await page.waitForSelector('#confirmM:not(.hidden)');
  ok('after the plain question, a delete still asks for “yes”',await page.evaluate(()=>!document.querySelector('#cfInput').closest('label').classList.contains('hidden')&&document.querySelector('#cfGo').disabled&&document.querySelector('#cfGo').classList.contains('danger')));
  await page.click('#confirmM [data-cancel]');await until(()=>document.querySelector('#confirmM').classList.contains('hidden'));
  await page.click('#trashList .tr-row:first-child [data-a="restore"]');await toast('Restored');
  await page.click('#trashM [data-cancel]');
  ok('Restore puts it back whole',(await poll('word:'+inkId,w=>!!w)).text===INK);
  await openWords();await chip('Facts');
  ok('…listed again',(await until(()=>document.querySelectorAll('#wdList .fcard').length===5))&&(await chips())[3]==='To sort (1)');

  /* ---------- 12. Study: word and fact cards in one queue ---------- */
  await setNewToday(15);await openStudy();
  ok('the day’s new allowance counts words and facts together',(await sy()).prog==='1 of 5');
  await setNewToday(0);await openStudy();
  let s=await sy();
  ok('the queue mixes words and facts, oldest first',s.prog==='1 of 7'&&s.term==='pilots');
  await key('Space');await key('2');await next('2 of 7');
  ok('then the second word',(await sy()).term==='ledger');
  await key('Space');await key('2');await next('3 of 7');
  s=await sy();
  ok('a cloze fact card: the text with the phrase blanked',s.ask==='What’s missing?'&&s.sent===SQUALL.replace('sudden, violent gust','_____')&&s.gap==='_____'&&!s.term&&!s.back&&s.show==='Show answer');
  await page.click('#syMode [data-m="cloze"]');
  ok('Sentence → word changes nothing on a fact card',same(await sy(),s));
  await page.click('#syMode [data-m="word"]');
  ok('cloze front screenshots',!(await studyShot('study-cloze-front')).length);
  await key('Space');s=await sy();
  ok('its back fills the phrase in and says where it’s from',s.back&&s.fill==='sudden, violent gust'&&s.sent===SQUALL&&s.book==='The Salt Almanac1. Part One'&&!s.note&&s.rates===3);
  ok('cloze back screenshots',!(await studyShot('study-cloze-back')).length);
  await key('2');await next('4 of 7');
  f=await poll('word:'+factId(kid,sq.id),f=>f&&f.srs);
  ok('rating a fact card saves its schedule',f.srs.interval===1&&f.srs.reps===1&&f.srs.seen===1);
  s=await sy();
  ok('a re-read fact card: “Remember this?” and the text',s.ask==='Remember this?'&&s.sent===BARO&&!s.gap&&s.show==='Show note');
  ok('re-read front screenshots',!(await studyShot('study-reread-front')).length);
  await key('Space');s=await sy();
  ok('its back: the note, the book and section',s.back&&s.note==='Grandpa’s rule.'&&s.book==='The Salt Almanac1. Part One');
  ok('re-read back screenshots',!(await studyShot('study-reread-back')).length);
  await key('3');await next('5 of 7');
  s=await sy();
  ok('without a note: Show source, then the book',s.sent===WALL&&s.show==='Show source');
  ok('a long text reads left-aligned',await page.$eval('#syCard .sy-fact',e=>e.classList.contains('long')&&getComputedStyle(e).textAlign==='left'));
  ok('long re-read front screenshots',!(await studyShot('study-long-front')).length);
  await key('Space');s=await sy();
  ok('…a book with one section shows just the book',s.book==='Harbour Notes'&&!s.note);
  await key('2');await next('6 of 7');await key('Space');await key('2');await next('7 of 7');await key('Space');await key('2');
  await until(()=>document.querySelector('#syCard').textContent.includes('All caught up'));
  ok('done: words and facts reviewed',(await text('#syCard')).includes('You reviewed 2 words and 5 facts.'));
  await page.click('#syActs [data-sy="back"]');await page.waitForSelector('#shelf:not(.hidden)');
  let log;for(const end=Date.now()+5000;Date.now()<end;await sleep(50)){log=((await readSettings(page))||{}).studyLog||{};if(log[dayKey()]&&log[dayKey()].new)break;}
  ok('the day’s new count includes the facts (written on leaving Study)',log[dayKey()].new===7);
});
