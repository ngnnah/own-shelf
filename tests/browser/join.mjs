// Joining highlights, as Kindle does: a new highlight that overlaps others, or touches one with only a space between,
// becomes one with them (at its start, at its end, bridging two, across two paragraphs); a selection inside one
// recolours it; notes join in reading order; Note on an overlapping selection; keys 1–5 and the pull quote's button;
// "Joined N highlights · Undo" putting back exactly what was there; a sorted Coral highlight keeping its id, so To sort
// and its fact card still find it; the count, the drawer and the Notebook showing one highlight.
// Usage: node tests/browser/join.mjs [repo dir]
// Screenshots (a joined highlight with its Undo toast at 390×844 and 1280×900; Note on an overlapping selection at
// 390×844) go to tests/browser/out/join/.
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
import {factId} from '../../vocab.js';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('join',8149);
const {page,ok,must,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','join');mkdirSync(shots,{recursive:true});

/* ---------- the book ---------- */
const P1='Alpha beta, gamma delta epsilon zeta eta. Theta iota kappa lambda mu nu xi omicron pi rho.';
const P2='Second paragraph opens with sigma tau upsilon phi chi psi omega.';
const P3='Facts live here: the anchor holds, the chain rattles, the keel stays dry.';
const P4='Filler comes first in this one. Use small tools to build large things. Filler comes after it too.';
const BOOK=`# Join Test\n\nBy Sam Tester\n\nAn opening paragraph that sets the scene before the real work begins.\n\n${P1}\n\n${P2}\n\n${P3}\n\n${P4}\n\n${'Filler words for the body of the text, read slowly. '.repeat(20)}\n`;

/* ---------- helpers ---------- */
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// JSON with sorted keys, so highlights compare however their keys were ordered; a list sorted by id
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const byId=hl=>canon([...hl].sort((a,b)=>a.id<b.id?-1:1));
// the local adapter's IndexedDB, read directly; the app doesn't wait for its writes, so poll
const idb=key=>page.evaluate(key=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,q=db.transaction('kv').objectStore('kv').get(key);q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}),key);
async function poll(key,fn=v=>!!v){let v;for(let i=0;i<50;i++){v=await idb(key);if(fn(v))return v;await sleep(100);}return v;}
let book;
const saved=fn=>poll('state:'+book,s=>!!s&&fn(s.hl||[])).then(s=>(s&&s.hl)||[]);
// Select from the start of `from` in the paragraph starting with pa to the end of `to` in the one starting with pb.
async function select(pa,from,pb,to){
  await page.evaluate((pa,from,pb,to)=>{
    const para=s=>[...document.querySelectorAll('#col p.hp')].find(p=>p.textContent.startsWith(s));
    const at=(el,off)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,len=0;while((n=w.nextNode())){if(off<=len+n.data.length) return [n,off-len];len+=n.data.length;}};
    const A=para(pa),B=para(pb);A.scrollIntoView({block:'center'});
    const r=document.createRange();r.setStart(...at(A,A.textContent.indexOf(from)));r.setEnd(...at(B,B.textContent.indexOf(to)+to.length));
    getSelection().removeAllRanges();getSelection().addRange(r);
  },pa,from,pb,to);
  return until(()=>!document.querySelector('#tool').classList.contains('hidden'));
}
const sel=(p,from,to=from)=>select(p,from,p,to);
// Escape: no toast, no toolbar, no selection, before the next step
async function quiet(){
  await page.keyboard.press('Escape');await page.evaluate(()=>getSelection().removeAllRanges());
  await until(()=>!document.querySelector('#toast').classList.contains('on')&&document.querySelector('#tool').classList.contains('hidden'));
}
// the highlights drawn in the text: id → {text (its blocks joined by |), color}
const drawn=()=>page.$$eval('#col .hp mark.hl',ms=>{const o={};ms.forEach(m=>{const pid=m.closest('.hp').dataset.pid;
  const x=o[m.dataset.h]||(o[m.dataset.h]={text:'',color:m.className.match(/\bc-(\w+)/)[1],pid});if(x.pid!==pid){x.text+='|';x.pid=pid;}x.text+=m.textContent;});
  return Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{text:v.text,color:v.color}]));});
const idOf=async start=>Object.entries(await drawn()).find(([,v])=>v.text.startsWith(start))?.[0];
const count=n=>until(n=>document.querySelector('#hlCount').textContent===n,String(n));
const toastIs=s=>until(s=>document.querySelector('#toast').classList.contains('on')&&document.querySelector('#toast').textContent===s,s);
const toastOn=()=>page.$eval('#toast',e=>e.classList.contains('on'));
const pidOf=start=>page.evaluate(s=>[...document.querySelectorAll('#col p.hp')].find(p=>p.textContent.startsWith(s)).dataset.pid,start);
async function toShelf(){
  if(await t.vis('#shelf')) return;
  const reader=await t.vis('#reader');
  await page.click(await t.vis('#notebook')?'#nbBack':'#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  if(reader) await sleep(450); // the reader's position save
}
async function openJoinTest(){await toShelf();await page.click('.cover[aria-label^="Join Test"]');await t.reader();}
async function notebook(tab){
  await toShelf();await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  const b=tab==='wd'?'#nbTabWd':'#nbTabHl';if(await page.$eval(b,e=>e.getAttribute('aria-selected'))!=='true') await page.click(b);
}
const chip=label=>page.evaluate(l=>[...document.querySelectorAll('#wdChips .chip')].find(b=>b.textContent.startsWith(l)).click(),label);
// Screenshots once the toast has settled: at phone and desktop size with the highlight `id` in view, or (no id) at
// phone size as it is.
async function shoot(label,id){
  await page.waitForFunction(()=>!document.querySelector('#toast').getAnimations().length);
  for(const [w,h] of id?[[390,844],[1280,900]]:[[390,844]]){
    await page.setViewport({width:w,height:h,deviceScaleFactor:w<500?2:1});
    if(id) await page.evaluate(id=>document.querySelector(`mark[data-h="${id}"]`).scrollIntoView({block:'center'}),id);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.screenshot({path:join(shots,`${label}-${w}.png`)});
  }
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
}

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addMarkdown(t,'join-test.md',BOOK,'Join Test');
  book=await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:last')));
  must('the book opens',(await text('.hero h1')).includes('Join'));

  /* ---------- 1. overlapping its start, then its end ---------- */
  await sel(P1,'gamma','delta');await page.click('#tool [data-c="sky"]');await count(1);
  const big=await idOf('gamma');
  must('a first highlight',same(await drawn(),{[big]:{text:'gamma delta',color:'sky'}}));
  await quiet();await sel(P1,'beta','gamma');await page.keyboard.press('2');
  ok('overlapping its start (key 2): one highlight, its id kept, the colour just picked',await toastIs('Joined 2 highlights · Undo')&&same(await drawn(),{[big]:{text:'beta, gamma delta',color:'mint'}})&&(await text('#hlCount'))==='1');
  await quiet();await sel(P1,'delta','epsilon');await page.click('#tool [data-c="amber"]');
  ok('overlapping its end (toolbar): joined the same way',await toastIs('Joined 2 highlights · Undo')&&same(await drawn(),{[big]:{text:'beta, gamma delta epsilon',color:'amber'}}));

  /* ---------- 2. touching with only a space between; words or punctuation between keep them apart ---------- */
  await quiet();await sel(P1,'zeta');await page.keyboard.press('4');
  ok('touching it with only a space between joins it',await toastIs('Joined 2 highlights · Undo')&&same(await drawn(),{[big]:{text:'beta, gamma delta epsilon zeta',color:'sky'}}));
  await quiet();await sel(P1,'kappa','lambda');await page.keyboard.press('1');await count(2);
  const kappa=await idOf('kappa');
  ok('with words and punctuation between, a new highlight stays apart, no toast',!!kappa&&kappa!==big&&(await drawn())[kappa].text==='kappa lambda'&&!(await toastOn()));

  /* ---------- 3. one highlight bridging two; Undo puts them back exactly ---------- */
  const was=await saved(hl=>hl.length===2&&hl.some(h=>h.id===kappa)),drawnWas=await drawn();
  await quiet();await sel(P1,'zeta eta','Theta iota kappa');await page.keyboard.press('5');
  const bridged={[big]:{text:'beta, gamma delta epsilon zeta eta. Theta iota kappa lambda',color:'amber'}};
  ok('bridging two joins all three into the earliest-made one',await toastIs('Joined 3 highlights · Undo')&&same(await drawn(),bridged)&&(await text('#hlCount'))==='1');
  const one=await saved(hl=>hl.length===1);
  ok('…stored as one highlight, without going to the Trash',one.length===1&&one[0].id===big&&one[0].segs.length===1&&!(await page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('upwind',1);r.onsuccess=()=>{const q=r.result.transaction('kv').objectStore('kv').getAllKeys();q.onsuccess=()=>{r.result.close();res(q.result.some(k=>k.startsWith('trash:')));};};}))));
  await page.click('#toast button');await toastIs('Undone');
  const back=await saved(hl=>hl.length===2);
  ok('Undo puts back exactly the highlights that were joined',byId(back)===byId(was)&&same(await drawn(),drawnWas)&&(await text('#hlCount'))==='2');
  await quiet();await sel(P1,'zeta eta','Theta iota kappa');await page.keyboard.press('5');
  must('joined again',await toastIs('Joined 3 highlights · Undo')&&same(await drawn(),bridged));
  await shoot('joined',big);
  ok('the toast is still up after the screenshots',await toastOn());

  /* ---------- 4. across two paragraphs ---------- */
  await quiet();await sel(P1,'pi rho.');await page.keyboard.press('1');await count(2);
  await quiet();await sel(P2,'Second','paragraph');await page.keyboard.press('1');await count(3);
  await quiet();await select(P1,'rho.',P2,'Second');await page.keyboard.press('2');
  const cross=await idOf('pi rho.');
  ok('a selection across two paragraphs joins a highlight in each',await toastIs('Joined 3 highlights · Undo')&&(await drawn())[cross].text==='pi rho.|Second paragraph'&&(await drawn())[cross].color==='mint'&&(await text('#hlCount'))==='2');
  const [p1,p2]=[await pidOf(P1),await pidOf(P2)];
  const cr=(await saved(hl=>hl.length===2&&hl.some(h=>h.id===cross&&h.segs.length===2))).find(h=>h.id===cross)||{segs:[]};
  ok('…one seg per paragraph, in reading order',same(cr.segs.map(s=>s.pid),[p1,p2])&&cr.segs[0].e===P1.length&&cr.segs[1].s===0);

  /* ---------- 5. inside one: a recolour ---------- */
  await quiet();await sel(P1,'gamma');await page.keyboard.press('4');
  await until(id=>document.querySelector(`mark[data-h="${id}"]`).classList.contains('c-sky'),big);
  ok('a selection inside one recolours just that one, no toast',same((await drawn())[big],{text:bridged[big].text,color:'sky'})&&(await text('#hlCount'))==='2'&&!(await toastOn()));

  /* ---------- 6. notes join in reading order; Note on an overlapping selection ---------- */
  await quiet();await sel(P2,'chi psi');await page.click('#tool [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  await page.type('#noteTa','Note on chi.');await page.click('#noteSave');await count(3);
  const chi=await idOf('chi');
  ok('Note on a fresh selection still makes a Sunny highlight',(await drawn())[chi].color==='sun');
  await quiet();await page.$eval(`mark[data-h="${cross}"]`,m=>m.scrollIntoView({block:'center'}));await page.click(`mark[data-h="${cross}"]`);
  await until(()=>!!document.querySelector('#tool:not(.hidden) [data-a="note"]'));await page.click('#tool [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  await page.type('#noteTa','Note on the crossing.');await page.click('#noteSave');
  await saved(hl=>hl.some(h=>h.id===cross&&h.note));
  await quiet();await sel(P2,'paragraph opens','chi');await page.click('#tool [data-c="mint"]');
  ok('joining two noted highlights: one highlight',await toastIs('Joined 3 highlights · Undo')&&(await drawn())[cross].text==='pi rho.|Second paragraph opens with sigma tau upsilon phi chi psi'&&!(await drawn())[chi]);
  let st=await saved(hl=>hl.length===2&&hl.some(h=>h.id===cross&&h.note.includes('chi')));
  ok('…its notes in reading order, a blank line apart',st.find(h=>h.id===cross).note==='Note on the crossing.\n\nNote on chi.');
  await quiet();await sel(P2,'psi omega.');await page.click('#tool [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  ok('Note on a selection overlapping one: its notes to edit, its colour kept, joined',(await page.$eval('#noteTa',e=>e.value))==='Note on the crossing.\n\nNote on chi.'&&await toastIs('Joined 2 highlights · Undo')
    &&same((await drawn())[cross],{text:'pi rho.|Second paragraph opens with sigma tau upsilon phi chi psi omega.',color:'mint'}));
  await shoot('note');
  await page.$eval('#noteTa',e=>{e.value+='\n\nAnd omega.';});await page.click('#noteSave');
  st=await saved(hl=>hl.some(h=>h.id===cross&&h.note.endsWith('omega.')));
  ok('…and saving it keeps them all',st.find(h=>h.id===cross).note==='Note on the crossing.\n\nNote on chi.\n\nAnd omega.'&&(await text('#hlCount'))==='2');

  /* ---------- 7. the pull quote's "Highlight this" joins too ---------- */
  await quiet();await sel(P4,'small tools');await page.keyboard.press('4');await count(3);
  const tools=await idOf('small tools');
  await page.$eval('.pull button',b=>b.scrollIntoView({block:'center'}));await page.click('.pull button');
  ok('the pull quote’s Highlight this joins it: one Sunny highlight over the sentence',await toastIs('Joined 2 highlights · Undo')&&same((await drawn())[tools],{text:'Use small tools to build large things.',color:'sun'})&&(await text('#hlCount'))==='3');

  /* ---------- 8. a sorted Coral highlight keeps its id: To sort and its fact card still find it ---------- */
  await quiet();await sel(P3,'the anchor holds');await page.keyboard.press('4');await count(4);
  const anchor=await idOf('the anchor');
  await quiet();await sel(P3,'the chain rattles');await page.keyboard.press('3');await count(5);
  const coral=await idOf('the chain');
  await saved(hl=>hl.some(h=>h.id===coral));
  await notebook('wd');await until(()=>[...document.querySelectorAll('#wdChips .chip')].some(b=>b.textContent==='To sort (1)'));
  await chip('To sort');await until(()=>document.querySelectorAll('#wdList .scard').length===1);
  await page.click('#wdList .scard [data-st="fact"]');await toastIs('Made a fact card');
  must('sorted as a fact, with a fact card',!!(await poll('word:'+factId(book,coral)))&&(await saved(hl=>hl.some(h=>h.id===coral&&h.study))).length===5);
  await openJoinTest();
  await quiet();await sel(P3,'anchor holds','the chain');await page.keyboard.press('3');
  ok('joining it with an earlier highlight keeps the sorted one’s id',await toastIs('Joined 3 highlights · Undo')&&same((await drawn())[coral],{text:'the anchor holds, the chain rattles',color:'coral'})&&!(await drawn())[anchor]);
  st=await saved(hl=>hl.length===4&&!hl.some(h=>h.id===anchor));
  const co=st.find(h=>h.id===coral);
  ok('…and its study, and the earlier one’s place',co.study.as==='fact'&&P3.slice(co.segs[0].s,co.segs[0].e)==='the anchor holds, the chain rattles');
  await notebook('wd');await until(()=>[...document.querySelectorAll('#wdChips .chip')].some(b=>/^To sort \(/.test(b.textContent)));
  ok('To sort still knows it as sorted: nothing to sort',(await page.$$eval('#wdChips .chip',b=>b.map(x=>x.textContent))).includes('To sort (0)'));
  await chip('Facts');await until(()=>document.querySelectorAll('#wdList .fcard').length===1);
  ok('its fact card still points at it',await page.$eval('#wdList .fcard .w-ex',(b,id)=>b.dataset.hl===id,coral));
  await page.click('#wdList .fcard .w-ex');await t.reader();
  ok('…and opens the joined highlight, flashed',await until(id=>document.querySelector(`mark[data-h="${id}"].flash`),coral));

  /* ---------- 9. the count, the drawer and the Notebook: one per joined highlight ---------- */
  const ids=Object.keys(await drawn()).sort();
  ok('the count: one per joined highlight',ids.length===4&&(await text('#hlCount'))==='4'&&same(ids,[big,cross,tools,coral].sort()));
  await t.openDrawer('#bHl','#drawer');
  const cards=await page.$$eval('#drList .hcard',cs=>cs.map(c=>({id:c.dataset.id,q:c.querySelector('.q').textContent,nt:c.querySelector('.nt')?.textContent||''})));
  ok('the drawer: one card each, with the joined text and notes',same(cards.map(c=>c.id).sort(),ids)&&cards.find(c=>c.id===big).q===bridged[big].text
    &&cards.find(c=>c.id===cross).q==='pi rho. ¶ Second paragraph opens with sigma tau upsilon phi chi psi omega.'&&cards.find(c=>c.id===cross).nt==='Note on the crossing.\n\nNote on chi.\n\nAnd omega.');
  await t.closeDrawer();
  await notebook('hl');await until(()=>document.querySelectorAll('#nbList .hcard').length>0);
  ok('the Notebook: one card each',same((await page.$$eval('#nbList .hcard',cs=>cs.map(c=>c.dataset.hl))).sort(),ids)&&(await text('#nbStats')).startsWith('4 highlights'));
});
