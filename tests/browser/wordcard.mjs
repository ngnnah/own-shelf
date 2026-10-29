// The richer word card: synonyms, antonyms and the dictionary's examples, in the word card, the Words tab and Study;
// meanings that keep their line breaks; lookups once per word and source, older words filled when first shown, saving
// offline; fact cards never looked up. No pictures (removed 2026-10-29): Wikipedia is never asked, a pasted picture
// isn't taken (pasted text is left to the field), and a card saved with pictures before shows none, keeps them stored
// until it's next saved (an edit, a Study rating), then loses them. Datamuse and Wiktionary are mocked (request
// interception), Wikipedia too, to count what asks it; the picture is drawn on a canvas at run time.
// Usage: node tests/browser/wordcard.mjs [repo dir]
// Screenshots (the word card with every section, the Words tab, a Study back; 390×844 and 1280×900, light and dark)
// go to tests/browser/out/wordcard/.
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
import {wordId,factId} from '../../vocab.js';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('wordcard',8148);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','wordcard');mkdirSync(shots,{recursive:true});

/* ---------- a synthetic picture: pasted, and stored on cards saved before pictures were removed ---------- */
const PNG=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=90;c.height=60;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,90,60);
  g.addColorStop(0,'#2F5A43');g.addColorStop(1,'#B7802A');x.fillStyle=g;x.fillRect(0,0,90,60);return c.toDataURL('image/png').split(',')[1];});
const OLDPIC={src:'data:image/png;base64,'+PNG,credit:{title:'Crossing',url:'https://en.wikipedia.org/wiki/Crossing'}};

/* ---------- the dictionaries, mocked; Wikipedia too, to count what asks it ---------- */
const DEFS={ephemeral:'Lasting for a short period of time.',barometer:'An instrument that measures air pressure.',obdurate:'Unreasonably stubborn.',lighthouse:'A tower with a light that guides ships.'};
const SYN={ephemeral:['transient','transitory','fugacious','impermanent','temporary'],obdurate:['stubborn','unyielding'],lighthouse:['beacon']};
const ANT={ephemeral:['permanent','lasting'],obdurate:['yielding']};
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
const noWiki=()=>!asked.some(x=>x.startsWith('wiki:'));
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
  asked.push('wiki:'+u.pathname); // Wikipedia or its pictures: nothing should ask
  json(req,404,{});
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
// what a card shows (the word card, or a Words tab card): its visible sections in order, their text, what Add offers,
// and how many pictures (img elements) it holds
const shown=root=>page.evaluate(root=>{
  const r=document.querySelector(root),vis=e=>e&&!e.closest('.hidden')&&getComputedStyle(e).display!=='none';
  const sec=k=>{const s=r.querySelector(`[data-x="${k}"]`);return vis(s)?s.querySelector('.wx-f').innerText:null;};
  const order=[...r.querySelectorAll('#wbDef,.w-def,[data-x="dex"],[data-x="syn"],[data-x="ant"],#wbRead,.w-ex')].filter(vis)
    .map(e=>e.dataset.x||(e.matches('#wbDef,.w-def')?'meaning':'reading')).filter((x,i,a)=>a[i-1]!==x);
  return {order,dex:sec('dex'),syn:sec('syn'),ant:sec('ant'),imgs:r.querySelectorAll('img').length,add:[...r.querySelectorAll('[data-x="add"] .w-addb')].map(b=>b.textContent),label:r.querySelector('#wbRead .w-lbl,.wcard>.w-lbl')?.textContent||''};
},root);
// paste text or a picture file into a field, as the clipboard would. → whether the app took the paste (preventDefault):
// a paste it leaves alone goes into the field as the browser does it
const pasteInto=(sel,what)=>page.evaluate((sel,what,b64)=>{const el=document.querySelector(sel);el.focus();const dt=new DataTransfer();
  if(what==='text') dt.setData('text/plain','tide and time');
  else dt.items.add(new window.File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'pasted.png',{type:'image/png'}));
  const e=new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;},sel,what,PNG);
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

  /* ---------- 1. saving a word fills its synonyms, antonyms and examples; no picture ---------- */
  const EPH=wordId('ephemeral');
  await saveWord(P1,'ephemeral');
  ok('saving fills the synonyms, antonyms and examples',await until(()=>!document.querySelector('#wordBox [data-x="ant"]').classList.contains('hidden')&&!document.querySelector('#wordBox [data-x="dex"]').classList.contains('hidden')));
  let c=await shown('#wordBox');
  ok('synonyms and antonyms from Datamuse',c.syn==='transient, transitory, fugacious, impermanent, temporary'&&c.ant==='permanent, lasting');
  ok('examples from Wiktionary: the usage example, then the quotation’s sentence with year and author',c.dex==='Our ephemeral joy faded by noon.\nIts ephemeral cheer was gone by dark. — 1850, Ann Example');
  ok('the word is bold in each example',same(await page.$$eval('#wordBox [data-x="dex"] b',b=>b.map(x=>x.textContent)),['ephemeral','ephemeral']));
  let w=await stored(EPH,w=>w&&w.tried&&w.tried.muse&&w.tried.wikt);
  ok('stored: syn, ant, dex with cites, and the lookups tried',same(w.syn,SYN.ephemeral)&&same(w.ant,ANT.ephemeral)&&w.dex.length===2&&w.dex[1].cite==='1850, Ann Example'&&w.dex[0].text.slice(w.dex[0].s,w.dex[0].e)==='ephemeral'&&same(w.tried,{muse:'ephemeral',wikt:'ephemeral'}));
  ok('the order: meaning, examples, synonyms, antonyms, then your reading, labelled',same(c.order,['meaning','dex','syn','ant','reading'])&&c.label==='From your reading');
  ok('no picture: none shown, none stored, Add offers nothing, Wikipedia never asked',c.imgs===0&&!(await page.$('#wordBox [data-x="pics"],#wordBox input[type="file"]'))&&same(c.add,[])&&!('pics' in w)&&noWiki());

  /* ---------- 2. pasting into the card: text is left to the field; a picture isn't taken ---------- */
  ok('pasted text is left to the field, as before (the meaning, a synonym)',!(await pasteInto('#wbDef','text'))&&!(await pasteInto('#wordBox [data-x="syn"] .wx-f','text')));
  ok('a pasted picture isn’t taken: nothing shows, no toast',!(await pasteInto('#wbDef','picture'))&&(await shown('#wordBox')).imgs===0&&!/picture/i.test(await text('#toast')));
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

  /* ---------- 4. Wiktionary's synonyms when Datamuse has none ---------- */
  const BAR=wordId('barometer');
  await saveWord(P1,'barometer');
  must('"barometer" is filled',await until(()=>!document.querySelector('#wordBox [data-x="syn"]').classList.contains('hidden')));
  c=await shown('#wordBox');
  ok('Datamuse has no synonyms: Wiktionary’s are used',c.syn==='aneroid, weatherglass'&&c.ant===null);
  ok('a quote template’s passage, year and author',c.dex==='The barometer fell all night, and we reefed at dawn. — 1901, Sam Writer');
  ok('no antonyms: hidden, and Add offers them',same(c.order,['meaning','dex','syn','reading'])&&same(c.add,['Antonyms']));
  w=await stored(BAR,w=>w&&w.tried&&w.tried.wikt);
  // a meaning with line breaks
  must('the looked-up meaning is in',await until(()=>document.querySelector('#wbDef').value!==''));
  await page.$eval('#wbDef',e=>{e.value='';});await page.focus('#wbDef');await page.keyboard.sendCharacter(MEANING);
  await page.click('#wbSave');await hidden('#wordBox');
  w=await stored(BAR,w=>w.def.includes('\n'));
  ok('a meaning keeps its line breaks when saved',(await text('#toast'))==='Meaning saved'&&w.def===MEANING);
  const before=asked.length;
  await tapWord('barometer',P1);await sleep(600);
  ok('opened again: nothing is looked up again',asked.length===before&&(await page.$eval('#wbDef',e=>e.value))===MEANING);
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
  ok('…synonyms and antonyms stored; Wiktionary had no page, which counts as tried',same(w.syn,SYN.obdurate)&&same(w.ant,ANT.obdurate)&&!(w.dex||[]).length&&same(w.tried,{muse:'obdurate',wikt:'obdurate'}));
  await closeCard();

  /* ---------- 6. fact cards: never looked up, no picture, nothing to add ---------- */
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
  const before6=asked.length;
  const factBtn=async p=>{const k=await page.evaluate(p=>[...document.querySelectorAll('#wdList .scard')].find(c=>c.textContent.includes(p)).dataset.k,p);await page.click(`#wdList .scard[data-k="${k}"] [data-st="fact"]`);await toast('Made a fact card');};
  await factBtn(P3);await factBtn(P4);
  await chip('Facts');await until(()=>document.querySelectorAll('#wdList .fcard').length===2);
  const hlIds=(await idb('state:'+bookId)).hl.map(h=>h.id); // P3's, then P4's
  const FB=factId(bookId,hlIds[0]),FI=factId(bookId,hlIds[1]);
  const fs=[await stored(FB),await stored(FI)];
  ok('a fact card, with a blank or without, isn’t looked up',fs.every(f=>f&&f.kind==='fact'&&!f.tried&&!('pics' in f))&&asked.length===before6);
  ok('…and shows no picture and nothing to add',(await page.$$(`${cardOf(FB)} [data-x],${cardOf(FI)} [data-x],${cardOf(FB)} img,${cardOf(FI)} img`)).length===0);

  /* ---------- 7. cards saved earlier: filled when first shown, not looked up again; pictures from before ---------- */
  // "lighthouse", saved before its lookups; "crossing" (its place in this book) and a fact card, saved with a picture
  // before pictures were removed, every lookup already tried
  const LH=wordId('lighthouse'),CR=wordId('crossing'),OF=factId('old','h1');
  const ex=(text,word)=>{const s=text.indexOf(word);return {text,s,e:s+word.length,bookId:'old',pid:'p1',ws:0,we:0,title:'Old Notes',at:1};};
  const b3=(await idb('doc:'+bookId)).blocks.find(b=>b.text===P3),cs=P3.indexOf('crossing');
  must('the block holding "crossing"',!!b3);
  await seed([{id:LH,term:'lighthouse',def:DEFS.lighthouse,pos:'noun',defSource:'Datamuse',examples:[ex('The lighthouse stood on the rock.','lighthouse')],added:2},
    {id:CR,term:'crossing',def:'A journey across water.',pos:'noun',defSource:'',examples:[{text:P3,s:cs,e:cs+8,bookId,pid:b3.id,ws:cs,we:cs+8,title:'Card Notes',at:3}],
      syn:['passage'],pics:[OLDPIC],tried:{wiki:'crossing',muse:'crossing',wikt:'crossing'},added:3},
    {id:OF,kind:'fact',text:'Salt keeps.',blank:null,note:'',bookId:'old',hlId:'h1',pid:'p1',ws:0,we:11,title:'Old Notes',section:'',pics:[OLDPIC],tried:{wiki:'salt'},added:4}]);
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
  await openWordsTab();await chip('Words');
  await page.$eval(cardOf(LH),e=>e.scrollIntoView({block:'center'}));
  ok('an older card, once on screen, is filled',await until(id=>!document.querySelector(`#wdList .wcard[data-id="${id}"] [data-x="dex"]`).classList.contains('hidden'),LH));
  w=await stored(LH,w=>w.tried&&w.tried.wikt);
  ok('…and stored, each source asked once, no picture',same(w.syn,['beacon'])&&w.dex[0].text==='The lighthouse blinked twice.'&&['syn','ant','wikt'].every(s=>count(s+':lighthouse')===1)&&same(w.tried,{muse:'lighthouse',wikt:'lighthouse'})&&!('pics' in w));
  c=await shown(cardOf(CR));
  ok('a word saved with a picture shows none in the Words tab; the rest as before',c.imgs===0&&c.syn==='passage'&&same(c.order,['meaning','syn','reading'])&&same(c.add,['Example','Antonyms']));
  await chip('Facts');
  ok('…nor a fact card saved with one',(await shown(cardOf(OF))).imgs===0);
  ok('shown, they aren’t rewritten: the pictures stay stored until each is next saved',(await idb('word:'+CR)).pics.length===1&&(await idb('word:'+OF)).pics.length===1);
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
  await openWordsTab();await chip('Words');await page.$eval(cardOf(LH),e=>e.scrollIntoView({block:'center'}));await sleep(800);
  ok('shown again after a reload: not looked up again',['syn','ant','wikt'].every(s=>count(s+':lighthouse')===1));
  // the word card: no picture; saved, the word loses its picture and keeps the rest
  await openTitle('Card Notes');await until(id=>!!document.querySelector(`#col .wd[data-w="${id}"]`),CR);
  await tapWord('crossing',P3);
  c=await shown('#wordBox');
  ok('the word card shows no picture either; Add offers the missing sections only',c.imgs===0&&same(c.add,['Example','Antonyms'])&&c.syn==='passage');
  await page.click('#wordBox [data-x="syn"] .wx-f');
  await page.evaluate(()=>getSelection().selectAllChildren(document.querySelector('#wordBox [data-x="syn"] .wx-f')));
  await page.keyboard.type('passage, voyage');
  await page.click('#wbSave');await hidden('#wordBox');
  w=await stored(CR,w=>same(w.syn,['passage','voyage']));
  ok('saved, it loses its picture; the rest stays',(await text('#toast'))==='Saved'&&same(w.syn,['passage','voyage'])&&!('pics' in w)&&w.def==='A journey across water.'&&w.examples.length===1&&w.tried.muse==='crossing');
  ok('nothing asked Wikipedia',noWiki());
  await openWordsTab();await chip('Words');

  /* ---------- 8. the Words tab: sections, a synonym edited in place, the meaning's line breaks after a reload ---------- */
  c=await shown(cardOf(EPH));
  ok('a word in the Words tab: meaning, examples, synonyms, antonyms, then your reading',same(c.order,['meaning','dex','syn','ant','reading'])&&c.label==='From your reading'&&c.imgs===0);
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

  /* ---------- 9. Study: synonyms and antonyms on the back, never a picture; rated, an old card loses its picture ---------- */
  await page.goto(t.base+'?study=1',{waitUntil:'networkidle0'});await page.waitForSelector('#study:not(.hidden)');
  await until(()=>!document.querySelector('#syCard').textContent.includes('Gathering'));
  const backs={};
  for(let i=0;i<10&&await page.$('#syActs [data-sy="show"]');i++){
    await page.keyboard.press('Space');await page.waitForSelector('#syCard .sy-back');
    const b=await page.evaluate(()=>({term:document.querySelector('#syCard .sy-term')?.textContent||'',fact:document.querySelector('#syCard .sy-fill')?.textContent||document.querySelector('#syCard .sy-fact')?.textContent||'',
      def:document.querySelector('#syCard .sy-def')?.innerText||'',align:document.querySelector('#syCard .sy-def')?getComputedStyle(document.querySelector('#syCard .sy-def')).textAlign:'',
      nyms:[...document.querySelectorAll('#syCard .sy-nyms')].map(p=>p.innerText.replace('\n',': ')),pic:!!document.querySelector('#syCard img')}));
    backs[b.term?'w:'+b.term:'f:'+b.fact]=b;
    if(b.term==='barometer') for(const [vw,vh,size] of SIZES) for(const theme of ['light','dark']){
      await view(vw,vh);await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);await shot(`study-back-${size}-${theme}`);
    }
    await view(390,844);await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
    const n=await text('#syProg');await page.keyboard.press('2');await until(n=>document.querySelector('#syProg').textContent!==n,n);
  }
  const eb=backs['w:ephemeral'],bb=backs['w:barometer'],cb=backs['w:crossing'],ob=backs['f:Salt keeps.'];
  ok('a word’s back: synonyms and antonyms under the meaning',!!eb&&same(eb.nyms,['SYNONYMS: transient, fleeting, brief','ANTONYMS: permanent']));
  ok('a meaning with line breaks keeps them on the back, left-aligned',!!bb&&bb.def===MEANING&&bb.align==='left'&&same(bb.nyms,['SYNONYMS: aneroid, weatherglass']));
  ok('no back shows a picture, the old fact card’s included',Object.keys(backs).length===8&&!!cb&&!!ob&&Object.values(backs).every(b=>!b.pic));
  w=await stored(OF,w=>w&&w.srs);
  ok('rated, the old fact card loses its picture and keeps its schedule',!!(w&&w.srs)&&!('pics' in w)&&w.text==='Salt keeps.');

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
