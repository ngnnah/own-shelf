// The richer word card: pictures (Wikipedia's, pasted, dropped or picked), synonyms, antonyms and the dictionary's
// examples, in the word card, the Words tab and Study; fact cards' pictures from their blank; meanings that keep their
// line breaks; lookups once per card and source, older cards filled when first shown, and saving offline.
// Datamuse, Wiktionary, Wikipedia and its thumbnails are mocked (request interception); the pictures are drawn on a
// canvas at run time. Usage: node tests/browser/wordcard.mjs [repo dir]
// Screenshots (the word card with every section, the Words tab, a Study back; 390×844 and 1280×900, light and dark)
// go to tests/browser/out/wordcard/.
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
import {wordId,factId} from '../../vocab.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('wordcard',8148);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','wordcard');mkdirSync(shots,{recursive:true});

/* ---------- two synthetic pictures: one to add by hand (900×600, shrunk to 640), one as Wikipedia's thumbnail ---------- */
const draw=(w,h,a,b)=>page.evaluate((w,h,a,b)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,w,h);
  g.addColorStop(0,a);g.addColorStop(1,b);x.fillStyle=g;x.fillRect(0,0,w,h);x.fillStyle='rgba(255,255,255,.75)';x.beginPath();x.arc(w/2,h/2,Math.min(w,h)/3,0,7);x.fill();
  return c.toDataURL('image/png').split(',')[1];},w,h,a,b);
const PNG=await draw(900,600,'#2F5A43','#B7802A'),THUMB=await draw(330,300,'#23395B','#9CC8A8');
const picPath=join(t.tmp,'picked.png');writeFileSync(picPath,Buffer.from(PNG,'base64'));

/* ---------- the dictionaries and Wikipedia, mocked ---------- */
const DEFS={ephemeral:'Lasting for a short period of time.',barometer:'An instrument that measures air pressure.',obdurate:'Unreasonably stubborn.',lighthouse:'A tower with a light that guides ships.'};
const SYN={ephemeral:['transient','transitory','fugacious','impermanent','temporary'],obdurate:['stubborn','unyielding'],lighthouse:['beacon']};
const ANT={ephemeral:['permanent','lasting'],obdurate:['yielding']};
const WIKI={barometer:'Barometer',ephemeral:'Ephemerality',lighthouse:'Lighthouse'}; // the article each title leads to
const WIKITEXT={
  ephemeral:`==English==
===Adjective===
# Lasting for a [[short]] period of time.
#: {{ux|en|Our '''ephemeral''' joy faded by noon.}}
#* '''1850''', {{w|Ann Example}}, ''A Made-up Book'', page 9:
#*: The crowd was loud. Its '''ephemeral''' cheer was gone by dark.`,
  barometer:`==English==
===Noun===
# An instrument for measuring air pressure.
#: {{syn|en|aneroid|weatherglass}}
#* {{quote-book|en|year=1901|author=Sam Writer|title=Sea Days|passage=The '''barometer''' fell all night, and we reefed at dawn.}}`,
  lighthouse:`==English==
===Noun===
# A tower with a light.
#: {{ux|en|The '''lighthouse''' blinked twice.}}`
};
let failing=false;const asked=[];
const count=what=>asked.filter(x=>x===what).length;
const json=(req,status,body)=>req.respond({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
const summary=title=>({type:'standard',title,thumbnail:{source:`https://thumb.wikimedia.org/test/330px-${title}.png`,width:330,height:300},content_urls:{desktop:{page:'https://en.wikipedia.org/wiki/'+title}}});
await page.setBypassServiceWorker(true); // so every request reaches the interception below
await page.setRequestInterception(true);
page.on('request',req=>{
  const u=new URL(req.url()),q=u.searchParams,h=u.hostname;
  if(!['api.datamuse.com','en.wiktionary.org','en.wikipedia.org','thumb.wikimedia.org'].includes(h)) return req.continue();
  if(failing) return req.abort('internetdisconnected');
  if(h==='api.datamuse.com'){
    if(q.has('sp')){asked.push('def:'+q.get('sp'));return json(req,200,DEFS[q.get('sp')]?[{word:q.get('sp'),defs:['adj\t'+DEFS[q.get('sp')]]}]:[]);}
    const rel=q.has('rel_syn')?'syn':'ant',w=q.get('rel_'+rel);asked.push(rel+':'+w);
    return json(req,200,((rel==='syn'?SYN:ANT)[w]||[]).map((word,i)=>({word,score:100-i})));
  }
  if(h==='en.wiktionary.org'){
    if(u.pathname!=='/w/api.php') return json(req,404,{});
    const w=q.get('page');asked.push('wikt:'+w);
    return json(req,200,WIKITEXT[w]?{parse:{title:w,pageid:1,wikitext:WIKITEXT[w]}}:{error:{code:'missingtitle'}});
  }
  if(h==='en.wikipedia.org'){
    const w=decodeURIComponent(u.pathname.split('/').pop()).replace(/_/g,' ').toLowerCase();asked.push('wiki:'+w);
    return WIKI[w]?json(req,200,summary(WIKI[w])):json(req,404,{});
  }
  asked.push('thumb:'+u.pathname.split('/').pop());
  req.respond({status:200,contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:Buffer.from(THUMB,'base64')});
});

/* ---------- the book ---------- */
const filler=n=>('Filler words for the body of the text, read slowly. '.repeat(n)).trim();
const P1='The storm passed quickly. Its calm was ephemeral, as calms are! The barometer fell again by noon.';
const P2='The keeper was obdurate about the lamps, and polished them every night.';
const P3='Check the barometer before every crossing.';
const P4='Ink fades; the sea remembers.';
const BOOK=`# Card Notes\n\nBy Lee Tester\n\n${P1}\n\n${filler(30)}\n\n${P2}\n\n${P3}\n\n${P4}\n\n${filler(30)}\n`;
const MEANING='Measures air pressure.\n• aneroid: no liquid\n• mercury: a glass tube';

/* ---------- helpers ---------- */
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const idb=key=>page.evaluate(key=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,q=db.transaction('kv').objectStore('kv').get(key);q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}),key);
const seed=words=>page.evaluate(words=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite'),s=tx.objectStore('kv');words.forEach(w=>s.put(w,'word:'+w.id));tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};}),words);
// the stored entry once fn holds (the app doesn't wait for its writes), else the last read
async function stored(id,fn=w=>!!w){const k='word:'+id;for(let i=0;i<50;i++){const w=await idb(k);if(fn(w))return w;await sleep(100);}return idb(k);}
const toast=s=>until(s=>document.querySelector('#toast').textContent===s,s);
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
async function select(inBlock,word){
  await page.evaluate((inBlock,word)=>{
    const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(inBlock));el.scrollIntoView({block:'center'});
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())&&!n.data.includes(word));
    const i=n.data.indexOf(word),r=document.createRange();r.setStart(n,i);r.setEnd(n,i+word.length);getSelection().removeAllRanges();getSelection().addRange(r);
  },inBlock,word);
  return until(()=>!!document.querySelector('#tool:not(.hidden) [data-a="word"]'));
}
async function saveWord(inBlock,word){await select(inBlock,word);await page.click('#tool [data-a="word"]');await page.waitForSelector('#wordBox:not(.hidden)');}
async function closeCard(){if(await vis('#wordBox')){await page.click('#wbClose');await hidden('#wordBox');}}
async function tapWord(term,inBlock){
  const at=await page.evaluate((sel,inBlock)=>{const u=[...document.querySelectorAll(sel)].find(e=>e.closest('.hp').textContent.includes(inBlock));u.scrollIntoView({block:'center'});
    const b=u.getClientRects()[0];return {x:b.x+b.width/2,y:b.y+b.height/2};},`.wd[data-w="${wordId(term)}"]`,inBlock);
  await page.mouse.click(at.x,at.y);await page.waitForSelector('#wordBox:not(.hidden)');
}
// what a card shows (the word card, or a Words tab card): its visible sections in order, their text, the pictures
const shown=root=>page.evaluate(root=>{
  const r=document.querySelector(root),vis=e=>e&&!e.closest('.hidden')&&getComputedStyle(e).display!=='none';
  const sec=k=>{const s=r.querySelector(`[data-x="${k}"]`);return vis(s)?s.querySelector('.wx-f').innerText:null;};
  const order=[...r.querySelectorAll('#wbDef,.w-def,[data-x="dex"],[data-x="syn"],[data-x="ant"],[data-x="pics"],#wbRead,.w-ex')].filter(vis)
    .map(e=>e.dataset.x||(e.matches('#wbDef,.w-def')?'meaning':'reading')).filter((x,i,a)=>a[i-1]!==x);
  const pics=[...r.querySelectorAll('[data-x="pics"] img')].map(i=>({w:i.naturalWidth,h:i.naturalHeight,src:i.src.slice(0,15),credit:i.closest('figure').querySelector('figcaption a')?.href||''}));
  return {order,dex:sec('dex'),syn:sec('syn'),ant:sec('ant'),pics,add:[...r.querySelectorAll('[data-x="add"] .w-addb')].map(b=>b.textContent),label:r.querySelector('#wbRead .w-lbl,.wcard>.w-lbl')?.textContent||''};
},root);
// paste or drop a picture file, as the clipboard or a drag would
const pasteInto=sel=>page.evaluate((sel,b64)=>{const el=document.querySelector(sel);el.focus();const dt=new DataTransfer();
  dt.items.add(new window.File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'pasted.png',{type:'image/png'}));
  el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},sel,PNG);
const dropOn=sel=>page.evaluate((sel,b64)=>{const el=document.querySelector(sel),dt=new DataTransfer();
  dt.items.add(new window.File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'dropped.png',{type:'image/png'}));
  for(const type of ['dragenter','dragover','drop']) el.dispatchEvent(new DragEvent(type,{dataTransfer:dt,bubbles:true,cancelable:true}));},sel,PNG);
const nPics=root=>page.$$eval(root+' [data-x="pics"] img',i=>i.length);
const picsIn=(root,n)=>until((root,n)=>document.querySelectorAll(root+' [data-x="pics"] img').length===n,root,n);
// where a box is, and whether it and its buttons are inside the visible area and on top
const fit=(box,buttons)=>page.evaluate((box,buttons)=>{
  const v=visualViewport,inside=r=>r.top>=v.offsetTop-.5&&r.bottom<=v.offsetTop+v.height+.5&&r.left>=v.offsetLeft-.5&&r.right<=v.offsetLeft+v.width+.5;
  const b=document.querySelector(box).getBoundingClientRect();
  const bt=buttons.every(s=>{const r=document.querySelector(s).getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return inside(r)&&!!hit&&!!hit.closest(s);});
  return b.height>0&&inside(b)&&bt;
},box,buttons);
async function toShelf(){if(!(await vis('#shelf'))){await page.click(await vis('#notebook')?'#nbBack':await vis('#study')?'#syBack':'#bHome');await page.waitForSelector('#shelf:not(.hidden)');}}
async function openTitle(title){await toShelf();await page.click(`.cover[aria-label^="${title}"]`);await t.reader();}
async function openWordsTab(){
  await toShelf();await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  if(await page.$eval('#nbTabWd',e=>e.getAttribute('aria-selected'))!=='true') await page.click('#nbTabWd');
  await until(()=>!document.querySelector('#wdList').textContent.includes('Gathering'));
}
const chip=label=>page.evaluate(l=>[...document.querySelectorAll('#wdChips .chip')].find(b=>b.textContent.startsWith(l)).click(),label);
const cardOf=id=>`#wdList .wcard[data-id="${id}"]`;
const shot=async(label,opts={})=>{await until(()=>!document.querySelector('#toast').classList.contains('on'));await sleep(250);await page.mouse.move(1,1);await page.screenshot({path:join(shots,label+'.png'),...opts});};
const SIZES=[[390,844,'phone'],[1280,900,'desktop']];
const view=(w,h)=>page.setViewport({width:w,height:h,deviceScaleFactor:w<500?2:1});

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addMarkdown(t,'card-notes.md',BOOK,'Card Notes');

  /* ---------- 1. saving a word fills its synonyms, antonyms and examples; "Ephemerality" brings no picture ---------- */
  const EPH=wordId('ephemeral');
  await saveWord(P1,'ephemeral');
  ok('saving fills the synonyms, antonyms and examples',await until(()=>!document.querySelector('#wordBox [data-x="ant"]').classList.contains('hidden')&&!document.querySelector('#wordBox [data-x="dex"]').classList.contains('hidden')));
  let c=await shown('#wordBox');
  ok('synonyms and antonyms from Datamuse',c.syn==='transient, transitory, fugacious, impermanent, temporary'&&c.ant==='permanent, lasting');
  ok('examples from Wiktionary: the usage example, then the quotation’s sentence with year and author',c.dex==='Our ephemeral joy faded by noon.\nIts ephemeral cheer was gone by dark. — 1850, Ann Example');
  ok('the word is bold in each example',same(await page.$$eval('#wordBox [data-x="dex"] b',b=>b.map(x=>x.textContent)),['ephemeral','ephemeral']));
  let w=await stored(EPH,w=>w&&w.tried&&w.tried.wiki&&w.tried.muse&&w.tried.wikt);
  ok('"ephemeral" leads to "Ephemerality": no picture, its thumbnail never fetched',count('wiki:ephemeral')===1&&!asked.some(x=>x.startsWith('thumb:'))&&!(w.pics||[]).length&&c.pics.length===0);
  ok('stored: syn, ant, dex with cites, and the lookups tried',same(w.syn,SYN.ephemeral)&&same(w.ant,ANT.ephemeral)&&w.dex.length===2&&w.dex[1].cite==='1850, Ann Example'&&w.dex[0].text.slice(w.dex[0].s,w.dex[0].e)==='ephemeral'&&same(w.tried,{wiki:'ephemeral',muse:'ephemeral',wikt:'ephemeral'}));
  ok('the order: meaning, examples, synonyms, antonyms, then your reading, labelled',same(c.order,['meaning','dex','syn','ant','reading'])&&c.label==='From your reading');
  ok('an empty section is hidden; Add offers only a picture',same(c.add,['Picture']));

  /* ---------- 2. pictures by hand: paste, drop, the Picture button; 3 at most; × removes ---------- */
  await pasteInto('#wbDef');
  ok('a picture pasted into the card is added',await picsIn('#wordBox',1)&&(await text('#toast'))==='Picture added');
  w=await stored(EPH,w=>w.pics&&w.pics.length===1);
  const dims=await page.evaluate(src=>new Promise(r=>{const i=new Image();i.onload=()=>r([i.naturalWidth,i.naturalHeight]);i.src=src;}),w.pics[0].src);
  ok('stored as a JPEG of at most 640 px, under 150 KB',w.pics[0].src.startsWith('data:image/jpeg;base64,')&&same(dims,[640,427])&&w.pics[0].src.length<150*1024&&!w.pics[0].credit);
  await dropOn('#wordBox .wb-head');
  ok('a picture dropped on the card is added (not imported as a book)',await picsIn('#wordBox',2)&&!(await vis('#importM'))&&!(await page.$eval('#dropAll',e=>e.classList.contains('on'))));
  await (await page.$('#wordBox .w-file')).uploadFile(picPath);
  ok('the Picture button adds one',await picsIn('#wordBox',3)&&(await stored(EPH,w=>w.pics.length===3)).pics.length===3);
  ok('with 3, the Picture button goes',!(await page.$('#wordBox .w-file')));
  await dropOn('#wordBox .wb-head');await toast('Up to 3 pictures');
  ok('a 4th is refused: "Up to 3 pictures"',await nPics('#wordBox')===3&&(await idb('word:'+EPH)).pics.length===3);
  await page.click('#wordBox [data-unpic="1"]');await toast('Picture removed');
  ok('× removes one',await nPics('#wordBox')===2&&(await stored(EPH,w=>w.pics.length===2)).pics.length===2&&!!(await page.$('#wordBox .w-file')));
  for(const [vw,vh,size] of SIZES){
    await view(vw,vh);await page.evaluate(()=>dispatchEvent(new Event('resize')));await sleep(150);
    ok(`${size}: with every section, the card and its buttons are inside the window`,await fit('#wordBox',['#wbClose','#wbSave']));
  }
  await view(390,844);await sleep(150);

  /* ---------- 3. editing in the card: a synonym and an example of your own, saved with Save ---------- */
  await page.click('#wordBox [data-x="syn"] .wx-f');
  await page.evaluate(()=>getSelection().selectAllChildren(document.querySelector('#wordBox [data-x="syn"] .wx-f')));
  await page.keyboard.type('transient, fleeting');
  await page.click('#wbSave');await hidden('#wordBox');
  w=await stored(EPH,w=>same(w.syn,['transient','fleeting']));
  ok('a synonym edited in the card is saved with Save',(await text('#toast'))==='Saved'&&same(w.syn,['transient','fleeting']));

  /* ---------- 4. a word with Wikipedia's picture; Wiktionary's synonyms when Datamuse has none ---------- */
  const BAR=wordId('barometer');
  await saveWord(P1,'barometer');
  ok('saving "barometer" brings Wikipedia’s picture',await until(()=>document.querySelectorAll('#wordBox [data-x="pics"] img').length===1));
  await until(()=>!document.querySelector('#wordBox [data-x="syn"]').classList.contains('hidden'));
  c=await shown('#wordBox');
  ok('the picture is credited "Wikipedia", linking to the article',c.pics.length===1&&c.pics[0].credit==='https://en.wikipedia.org/wiki/Barometer'&&await page.$eval('#wordBox figcaption a',a=>a.textContent==='Wikipedia'&&a.target==='_blank'));
  ok('Datamuse has no synonyms: Wiktionary’s are used',c.syn==='aneroid, weatherglass'&&c.ant===null);
  ok('a quote template’s passage, year and author',c.dex==='The barometer fell all night, and we reefed at dawn. — 1901, Sam Writer');
  ok('no antonyms: hidden, and Add offers them',same(c.order,['meaning','dex','syn','pics','reading'])&&same(c.add,['Antonyms','Picture']));
  w=await stored(BAR,w=>w&&w.pics&&w.tried&&w.tried.wikt);
  ok('stored: the thumbnail as a JPEG data URL with its credit',w.pics[0].src.startsWith('data:image/jpeg')&&same(w.pics[0].credit,{title:'Barometer',url:'https://en.wikipedia.org/wiki/Barometer'})&&count('thumb:330px-Barometer.png')===1);
  // a meaning with line breaks
  must('the looked-up meaning is in',await until(()=>document.querySelector('#wbDef').value!==''));
  await page.$eval('#wbDef',e=>{e.value='';});await page.focus('#wbDef');await page.keyboard.sendCharacter(MEANING);
  await page.click('#wbSave');await hidden('#wordBox');
  w=await stored(BAR,w=>w.def.includes('\n'));
  ok('a meaning keeps its line breaks when saved',(await text('#toast'))==='Meaning saved'&&w.def===MEANING);
  const before=asked.length;
  await tapWord('barometer',P1);await sleep(600);
  ok('opened again: nothing is looked up again',asked.length===before&&(await page.$eval('#wbDef',e=>e.value))===MEANING&&await nPics('#wordBox')===1);
  await closeCard();

  /* ---------- 5. offline: the word is saved anyway; its lookups wait for the next time it's shown ---------- */
  const OBD=wordId('obdurate');
  failing=true;
  await saveWord(P2,'obdurate');await toast('Saved to Words');await sleep(500);
  w=await stored(OBD);
  ok('offline: saved, nothing filled, no lookup marked as tried',w&&w.term==='obdurate'&&!w.tried&&!(w.syn||[]).length&&(await shown('#wordBox')).syn===null);
  await closeCard();failing=false;
  await tapWord('obdurate',P2);
  ok('online again, shown again: looked up and filled',await until(()=>!document.querySelector('#wordBox [data-x="syn"]').classList.contains('hidden')));
  w=await stored(OBD,w=>w.tried&&w.tried.wikt);
  ok('…synonyms and antonyms stored; Wiktionary had no page, which counts as tried',same(w.syn,SYN.obdurate)&&same(w.ant,ANT.obdurate)&&!(w.dex||[]).length&&w.tried.wikt==='obdurate'&&w.tried.wiki==='obdurate');
  await closeCard();

  /* ---------- 6. fact cards: a picture from the blank; none without one ---------- */
  for(const p of [P3,P4]){
    await page.evaluate(p=>{const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(p));el.scrollIntoView({block:'center'});const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);},p);
    await until(()=>!document.querySelector('#tool').classList.contains('hidden'));await page.keyboard.press('3');
  }
  must('two coral highlights',await until(()=>document.querySelector('#hlCount').textContent==='2'));
  const bookId=await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:last')));
  await sleep(700); // the highlights are saved after 500 ms
  await openWordsTab();await chip('To sort');await until(()=>document.querySelectorAll('#wdList .scard').length===2);
  // select "barometer" in the first highlight as its blank (as touch does: the selection settles)
  await page.evaluate(p=>{const c=[...document.querySelectorAll('#wdList .scard')].find(c=>c.textContent.includes(p)),w=[...c.querySelectorAll('.st-w')].find(x=>x.textContent==='barometer');
    const r=document.createRange();r.selectNodeContents(w);getSelection().removeAllRanges();getSelection().addRange(r);},P3);
  must('the blank is set',await until(()=>[...document.querySelectorAll('#wdList .f-gap')].some(g=>g.textContent==='barometer')));
  const factBtn=async p=>{const k=await page.evaluate(p=>[...document.querySelectorAll('#wdList .scard')].find(c=>c.textContent.includes(p)).dataset.k,p);await page.click(`#wdList .scard[data-k="${k}"] [data-st="fact"]`);await toast('Made a fact card');};
  await factBtn(P3);await factBtn(P4);
  await chip('Facts');await until(()=>document.querySelectorAll('#wdList .fcard').length===2);
  const hlIds=(await idb('state:'+bookId)).hl.map(h=>h.id); // P3's, then P4's
  const FB=factId(bookId,hlIds[0]),FI=factId(bookId,hlIds[1]);
  ok('a fact card gets a picture from its blank',await until(id=>document.querySelectorAll(`#wdList .fcard[data-id="${id}"] [data-x="pics"] img`).length===1,FB)&&(await stored(FB,f=>f&&f.pics)).pics.length===1);
  ok('…looked up by the blank, once',count('wiki:barometer')===2);
  c=await shown(cardOf(FI));
  ok('a fact card without a blank gets none, and isn’t looked up',c.pics.length===0&&!(await idb('word:'+FI)).tried&&!asked.some(x=>/^wiki:ink/.test(x)));
  c=await shown(cardOf(FB));
  ok('a fact card in the Words tab shows its picture, the ×, and the Picture button',c.pics.length===1&&!!(await page.$(cardOf(FB)+' [data-unpic="0"]'))&&same(c.add,['Picture']));

  /* ---------- 7. cards saved earlier: filled when first shown, not looked up again; the size guard ---------- */
  const LH=wordId('lighthouse'),BIG=wordId('bulky');
  const ex=(text,word)=>{const s=text.indexOf(word);return {text,s,e:s+word.length,bookId:'old',pid:'p1',ws:0,we:0,title:'Old Notes',at:1};};
  await seed([{id:LH,term:'lighthouse',def:DEFS.lighthouse,pos:'noun',defSource:'Datamuse',examples:[ex('The lighthouse stood on the rock.','lighthouse')],added:2},
    {id:BIG,term:'bulky',def:'Large. '+'Very large indeed. '.repeat(43000),pos:'',defSource:'',examples:[ex('A bulky parcel.','bulky')],added:1,tried:{wiki:'bulky',muse:'bulky',wikt:'bulky'}}]);
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
  await openWordsTab();await chip('Words');
  await page.$eval(cardOf(LH),e=>e.scrollIntoView({block:'center'}));
  ok('an older card, once on screen, is filled',await until(id=>document.querySelectorAll(`#wdList .wcard[data-id="${id}"] [data-x="pics"] img`).length===1&&!document.querySelector(`#wdList .wcard[data-id="${id}"] [data-x="dex"]`).classList.contains('hidden'),LH));
  w=await stored(LH,w=>w.tried&&w.tried.wikt&&w.tried.wiki);
  ok('…and stored, each source asked once',w.pics.length===1&&same(w.syn,['beacon'])&&w.dex[0].text==='The lighthouse blinked twice.'&&['wiki','syn','ant','wikt'].every(s=>count(s+':lighthouse')===1));
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
  await openWordsTab();await chip('Words');await page.$eval(cardOf(LH),e=>e.scrollIntoView({block:'center'}));await sleep(800);
  ok('shown again after a reload: not looked up again',['wiki','syn','ant','wikt'].every(s=>count(s+':lighthouse')===1)&&await nPics(cardOf(LH))===1);
  await page.$eval(cardOf(BIG),e=>e.scrollIntoView({block:'center'}));
  await dropOn(cardOf(BIG)+' .w-head');await toast('Too big for this card');
  ok('a picture that would take a card past ~800 KB is refused',await nPics(cardOf(BIG))===0&&!((await idb('word:'+BIG)).pics||[]).length);

  /* ---------- 8. the Words tab: sections, a synonym edited in place, the meaning's line breaks after a reload ---------- */
  c=await shown(cardOf(EPH));
  ok('a word in the Words tab: meaning, examples, synonyms, antonyms, pictures, then your reading',same(c.order,['meaning','dex','syn','ant','pics','reading'])&&c.label==='From your reading'&&c.pics.length===2);
  await page.$eval(cardOf(EPH),e=>e.scrollIntoView({block:'center'}));
  await page.click(cardOf(EPH)+' [data-x="syn"] .wx-f');
  await page.$eval(cardOf(EPH)+' [data-x="syn"] .wx-f',e=>{e.textContent='transient, fleeting, brief';});
  await page.keyboard.press('Enter');await toast('Synonyms saved');
  ok('a synonym edited in place is saved (Enter)',same((await stored(EPH,w=>w.syn.length===3)).syn,['transient','fleeting','brief']));
  await page.click(cardOf(EPH)+' [data-x="ant"] .wx-f');await page.$eval(cardOf(EPH)+' [data-x="ant"] .wx-f',e=>{e.textContent='';});
  await page.keyboard.press('Enter');await toast('Antonyms saved');
  ok('emptied, a section hides and Add offers it again',(await shown(cardOf(EPH))).ant===null&&(await shown(cardOf(EPH))).add.includes('Antonyms')&&!(await idb('word:'+EPH)).ant.length);
  await page.click(cardOf(EPH)+' [data-add="ant"]');
  ok('Add shows the empty section, ready to type',await page.evaluate(id=>document.activeElement===document.querySelector(`#wdList .wcard[data-id="${id}"] [data-x="ant"] .wx-f`),EPH));
  await page.keyboard.type('permanent');await page.keyboard.press('Enter');await toast('Antonyms saved');
  ok('…and typing there saves it',same((await stored(EPH,w=>w.ant.length===1)).ant,['permanent']));
  // three lines on screen (Chrome renders an editable plain-text field pre-wrap; the stored text is already collapsed)
  const lines=sel=>page.$eval(sel,e=>({text:e.innerText,lines:Math.round(e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).lineHeight))}));
  ok('the meaning keeps its line breaks in the Words tab',same(await lines(cardOf(BAR)+' .w-def'),{text:MEANING,lines:3}));
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
  await openWordsTab();await chip('Words');
  ok('…and after a reload',same(await lines(cardOf(BAR)+' .w-def'),{text:MEANING,lines:3}));
  ok('no horizontal scroll at phone width',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));

  /* ---------- 9. Study: synonyms, antonyms and the first picture on the back ---------- */
  await page.goto(t.base+'?study=1',{waitUntil:'networkidle0'});await page.waitForSelector('#study:not(.hidden)');
  await until(()=>!document.querySelector('#syCard').textContent.includes('Gathering'));
  const backs={};
  for(let i=0;i<10&&await page.$('#syActs [data-sy="show"]');i++){
    await page.keyboard.press('Space');await page.waitForSelector('#syCard .sy-back');
    const b=await page.evaluate(()=>({term:document.querySelector('#syCard .sy-term')?.textContent||'',fact:document.querySelector('#syCard .sy-fill')?.textContent||document.querySelector('#syCard .sy-fact')?.textContent||'',
      def:document.querySelector('#syCard .sy-def')?.innerText||'',align:document.querySelector('#syCard .sy-def')?getComputedStyle(document.querySelector('#syCard .sy-def')).textAlign:'',
      nyms:[...document.querySelectorAll('#syCard .sy-nyms')].map(p=>p.innerText.replace('\n',': ')),pic:!!document.querySelector('#syCard .sy-back .sy-pic')}));
    backs[b.term?'w:'+b.term:'f:'+b.fact]=b;
    if(b.term==='barometer') for(const [vw,vh,size] of SIZES) for(const theme of ['light','dark']){
      await view(vw,vh);await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);await shot(`study-back-${size}-${theme}`);
    }
    await view(390,844);await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
    const n=await text('#syProg');await page.keyboard.press('2');await until(n=>document.querySelector('#syProg').textContent!==n,n);
  }
  const eb=backs['w:ephemeral'],bb=backs['w:barometer'],fb=backs['f:barometer'],fi=backs['f:'+P4];
  ok('a word’s back: synonyms and antonyms under the meaning, and its first picture',!!eb&&same(eb.nyms,['SYNONYMS: transient, fleeting, brief','ANTONYMS: permanent'])&&eb.pic);
  ok('a meaning with line breaks keeps them on the back, left-aligned',!!bb&&bb.def===MEANING&&bb.align==='left'&&same(bb.nyms,['SYNONYMS: aneroid, weatherglass'])&&bb.pic);
  ok('a fact card’s back shows its picture; one without has none',!!fb&&fb.pic&&!!fi&&!fi.pic);

  /* ---------- 10. screenshots: the word card with every section, and the Words tab ---------- */
  for(const [vw,vh,size] of SIZES) for(const theme of ['light','dark']){
    await view(vw,vh);await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);
    await openTitle('Card Notes');await tapWord('ephemeral',P1);await sleep(300);
    ok(`${size} ${theme}: the full card fits, buttons in view`,await fit('#wordBox',['#wbClose','#wbSave']));
    await shot(`card-${size}-${theme}`);await closeCard();
    await openWordsTab();await chip('Words');
    await page.$eval(cardOf(EPH),e=>e.scrollIntoView({block:'start'}));await page.evaluate(()=>scrollBy(0,-16));
    await shot(`words-${size}-${theme}`);
  }
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
});
