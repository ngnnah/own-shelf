// Vocabulary: save a word from the reader, its card and meaning, the underline in the text, the Notebook's Words tab,
// editing a meaning, the Trash. Datamuse and Wiktionary are mocked (request interception), so no test reaches them.
// Usage: node tests/browser/words.mjs [repo dir]
// Screenshots (toolbar, word card, underline, Words tab; 390×844 and 1280×900, light and dark) go to tests/browser/out/words/.
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
import {wordId} from '../../vocab.js';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('words',8140);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','words');mkdirSync(shots,{recursive:true});

/* ---------- the dictionaries, mocked ---------- */
const DATAMUSE={
  ephemeral:[{word:'ephemeral',defs:['adj\tLasting for a short period of time.']}],
  ship:[{word:'ship',defs:['n\tA large boat.']}],
  river:[{word:'river',defs:['n\tA large stream of water.']}],
  obdurate:[{word:'obdurate',defs:['adj\tUnreasonably stubborn.']}],
  tide:[{word:'tide',defs:['n\tThe rise and fall of the sea.']}]
};
const WIKTIONARY={quixotic:{en:[{partOfSpeech:'Adjective',definitions:[{definition:'Acting with the desire to do <a href="/wiki/noble">noble</a> deeds, without thought of practicality.'}]}]}};
let failing=false;const asked=[];
const json=(req,status,body)=>req.respond({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
await page.setBypassServiceWorker(true); // so every request reaches the interception below
await page.setRequestInterception(true);
page.on('request',req=>{
  const u=new URL(req.url());
  if(u.hostname==='api.datamuse.com'){const w=u.searchParams.get('sp');asked.push('datamuse:'+w);return failing?req.abort('failed'):json(req,200,DATAMUSE[w]||[]);}
  if(u.hostname==='en.wiktionary.org'){const w=decodeURIComponent(u.pathname.split('/').pop());asked.push('wiktionary:'+w);return failing?req.abort('failed'):WIKTIONARY[w]?json(req,200,WIKTIONARY[w]):json(req,404,{});}
  if(u.hostname==='en.wikipedia.org') return failing?req.abort('failed'):json(req,404,{}); // pictures: see wordcard.mjs
  req.continue();
});

/* ---------- helpers ---------- */
const filler=n=>('Filler words for the body of the text, read slowly. '.repeat(n)).trim();
const P1='The storm passed quickly. Its calm was ephemeral, as calms are! Ships stayed in port while Rivers watched the harbour.';
const P2='Nothing here was ephemeral for long. The keeper wrote quixotic plans in his ledger every night, and the lanterns burned.';
const P3='Some days the sea was obdurate and grey, and the gulls kept away from the rocks.';
const BOOK1=`# Word Test\n\nBy Lee Tester\n\n${P1}\n\n${filler(50)}\n\n${filler(50)}\n\n${P2}\n\n${P3}\n\n${filler(30)}\n`;
const BOOK2=`# Harbour Notes\n\nBy June Park\n\nThe tide was ephemeral too, and it came back each morning.\n\n${filler(30)}\n`;

// The local adapter's IndexedDB, read directly; the app doesn't await its writes, so poll.
const idb=key=>page.evaluate(key=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,q=db.transaction('kv').objectStore('kv').get(key);q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}),key);
async function stored(term,fn=w=>!!w){const k='word:'+wordId(term);for(let i=0;i<50;i++){const w=await idb(k);if(fn(w))return w;await sleep(100);}return idb(k);}

const toast=()=>text('#toast');
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
// Select the nth `word` inside the block whose text contains `inBlock`, then wait for the toolbar.
async function select(inBlock,word,nth=0){
  await page.evaluate((inBlock,word,nth)=>{
    const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(inBlock));el.scrollIntoView({block:'center'});
    // the block's text nodes (saved words and highlights split it) and where each starts in the whole text
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];let n,full='';
    while((n=w.nextNode())){nodes.push([n,full.length]);full+=n.data;}
    let i=-1;for(let k=0;k<=nth;k++) i=full.indexOf(word,i+1);
    const at=off=>{const [node,start]=nodes.findLast(([,s])=>s<=off);return [node,off-start];};
    const r=document.createRange();r.setStart(...at(i));r.setEnd(...at(i+word.length));getSelection().removeAllRanges();getSelection().addRange(r);
  },inBlock,word,nth);
  return until(()=>!document.querySelector('#tool').classList.contains('hidden')&&!!document.querySelector('#tool [data-a="word"]'));
}
// Select across two blocks (from the start of one to the end of the next).
async function selectAcross(a,b){
  await page.evaluate((a,b)=>{const f=t=>[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(t));const x=f(a),y=f(b);
    const r=document.createRange();r.setStart(x.firstChild,0);const l=y.lastChild;r.setEnd(l,l.length);getSelection().removeAllRanges();getSelection().addRange(r);},a,b);
  return until(()=>!document.querySelector('#tool').classList.contains('hidden'));
}
async function saveWord(inBlock,word,nth=0){
  await select(inBlock,word,nth);await page.click('#tool [data-a="word"]');
  await page.waitForSelector('#wordBox:not(.hidden)',{timeout:5000}).catch(()=>{});
}
const card=()=>page.evaluate(()=>({term:document.querySelector('#wbTerm').textContent,pos:document.querySelector('#wbPos').textContent,def:document.querySelector('#wbDef').value,
  ph:document.querySelector('#wbDef').placeholder,src:document.querySelector('#wbSrc').textContent,ex:document.querySelector('#wbEx').innerHTML}));
const defFilled=()=>until(()=>document.querySelector('#wbDef').value!=='');
async function closeCard(){if(await vis('#wordBox')){await page.click('#wbClose');await hidden('#wordBox');}}
// Tap a saved word in the text, as a finger would: the middle of its first line box.
async function tapWord(term,inBlock){
  const sel=`.wd[data-w="${wordId(term)}"]`;
  const at=await page.evaluate((sel,inBlock)=>{const u=[...document.querySelectorAll(sel)].find(e=>e.closest('.hp').textContent.includes(inBlock));u.scrollIntoView({block:'center'});
    const b=u.getClientRects()[0];return {x:b.x+b.width/2,y:b.y+b.height/2};},sel,inBlock);
  await page.mouse.click(at.x,at.y);await page.waitForSelector('#wordBox:not(.hidden)',{timeout:5000}).catch(()=>{});
}
const underlines=(term,inBlock)=>page.$$eval(`.wd[data-w="${wordId(term)}"]`,(els,inBlock)=>els.filter(e=>e.closest('.hp').textContent.includes(inBlock)).map(e=>e.textContent),inBlock);
async function toShelf(){if(!(await vis('#shelf'))){await page.click(await vis('#notebook')?'#nbBack':'#bHome');await page.waitForSelector('#shelf:not(.hidden)');}}
async function openTitle(title){await toShelf();await page.click(`.cover[aria-label^="${title}"]`);await t.reader();}
async function openWordsTab(){
  await toShelf();await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  if(await page.$eval('#nbTabWd',e=>e.getAttribute('aria-selected'))!=='true') await page.click('#nbTabWd');
  await until(()=>!document.querySelector('#wdList').textContent.includes('Gathering'));
}
const terms=()=>page.$$eval('#wdList .wcard .w-term',els=>els.map(e=>e.textContent));
const search=q=>page.$eval('#wdQ',(e,q)=>{e.value=q;e.dispatchEvent(new Event('input',{bubbles:true}));},q);
const cardOf=term=>`#wdList .wcard[data-id="${wordId(term)}"]`;
async function openTrash(){
  await toShelf();await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');
  await until(()=>!document.querySelector('#trashList').textContent.includes('Opening'));
}
async function restoreFirst(){
  const n=await page.$$eval('#trashList .tr-row',e=>e.length);
  await page.click('#trashList .tr-row:first-child [data-a="restore"]');
  await until(n=>document.querySelectorAll('#trashList .tr-row').length===n-1,n);
  await page.click('#trashM [data-cancel]');await hidden('#trashM');
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addMarkdown(t,'word-test.md',BOOK1,'Word Test');

  // 1. save a word: the card fills its meaning from the (mocked) dictionary
  ok('the selection toolbar has Word',await select(P1,'ephemeral')&&(await text('#tool [data-a="word"]'))==='Word');
  await page.click('#tool [data-a="word"]');await page.waitForSelector('#wordBox:not(.hidden)');
  ok('Word says "Saved to Words" and shows the card',(await toast())==='Saved to Words'&&await vis('#wordBox')&&!(await vis('#tool')));
  await defFilled();let c=await card();
  ok('the card: term, part of speech, meaning from the dictionary and its source',c.term==='ephemeral'&&c.pos==='adjective'&&c.def==='Lasting for a short period of time.'&&c.src==='from Datamuse');
  ok('the card shows the sentence with the word in bold',c.ex==='Its calm was <b>ephemeral</b>, as calms are!');
  ok('it makes no highlight',(await text('#hlCount'))==='0'&&!(await page.$('mark.hl')));
  let w=await stored('ephemeral',w=>w&&w.def);
  ok('stored: lower case, one example with its place, no schedule yet, the meaning',w.term==='ephemeral'&&w.examples.length===1&&!('srs' in w)&&w.defSource==='Datamuse'
    &&w.examples[0].text==='Its calm was ephemeral, as calms are!'&&w.examples[0].title==='Word Test'&&P1.slice(w.examples[0].ws,w.examples[0].we)==='ephemeral');
  ok('the word is underlined where it was saved',same(await underlines('ephemeral',P1),['ephemeral'])&&same(await underlines('ephemeral',P2),[]));
  ok('the underline is dotted',await page.$eval('.wd',e=>getComputedStyle(e).textDecorationStyle)==='dotted');
  await closeCard();
  ok('Close hides the card',!(await vis('#wordBox')));

  // 2. the same word from another place adds an example; a part of a word stretches to the whole word
  await saveWord(P2,'phemer');
  w=await stored('ephemeral',w=>w&&w.examples.length===2);
  ok('the same word from another place adds an example',w.examples.length===2&&w.examples[1].text==='Nothing here was ephemeral for long.'&&(await toast())==='Saved to Words');
  ok('a part of a word saves the whole word',(await card()).ex==='Nothing here was <b>ephemeral</b> for long.'&&same(await underlines('ephemeral',P2),['ephemeral']));
  await closeCard();
  await saveWord(P1,'ephemeral');
  ok('the same place again: "Already in Words", no new example',(await toast())==='Already in Words'&&(await stored('ephemeral')).examples.length===2&&await vis('#wordBox'));
  await closeCard();

  // 3. casing, base forms, Wiktionary, nothing found
  await saveWord(P1,'Rivers');await defFilled();
  ok('a capitalised word mid-sentence keeps its capital (a name)',(await card()).term==='Rivers'&&(await stored('Rivers')).term==='Rivers');
  await closeCard();
  await saveWord(P1,'Ships');await defFilled();c=await card();
  ok('a word starting a sentence is stored lower case',c.term==='ships'&&(await stored('ships')).term==='ships');
  ok('no entry for "ships": the base form "ship" is looked up',c.def==='A large boat.'&&c.pos==='noun'&&asked.includes('datamuse:ship'));
  await closeCard();
  await saveWord(P2,'quixotic');await defFilled();c=await card();
  ok('not in Datamuse: Wiktionary, HTML stripped',c.def==='Acting with the desire to do noble deeds, without thought of practicality.'&&c.src==='from Wiktionary'&&c.pos==='adjective');
  await closeCard();
  await saveWord(P2,'every night');
  await until(()=>document.querySelector('#wbDef').placeholder.startsWith('No meaning'));c=await card();
  ok('a short phrase is saved; nothing found leaves the meaning empty',c.term==='every night'&&c.def===''&&c.ph==='No meaning found. Write your own.'&&(await stored('every night')).def==='');
  await page.type('#wbDef','Each night, without fail');await page.click('#wbSave');await hidden('#wordBox');
  w=await stored('every night',w=>w.def);
  ok('a meaning typed in the card is saved as your own',(await toast())==='Meaning saved'&&w.def==='Each night, without fail'&&w.defSource==='');

  // 4. what Word refuses
  const before=await page.$$eval('.wd',e=>e.length);
  await select(P2,'wrote quixotic plans in his ledger');await page.click('#tool [data-a="word"]');
  ok('more than 4 words: asks for a word or short phrase',(await toast())==='Select a word or a short phrase'&&!(await vis('#wordBox'))&&!(await idb('word:'+wordId('wrote quixotic plans in his ledger'))));
  await selectAcross(P2,P3);await page.click('#tool [data-a="word"]');
  ok('across two blocks: asks for a word or short phrase',(await toast())==='Select a word or a short phrase'&&!(await vis('#wordBox'))&&(await page.$$eval('.wd',e=>e.length))===before);
  await page.evaluate(()=>getSelection().removeAllRanges());await hidden('#tool');

  // 5. the dictionary failing: the word is saved with no meaning, and looked up again next time it's shown
  failing=true;
  await saveWord(P3,'obdurate');
  await until(()=>document.querySelector('#wbDef').placeholder.startsWith('Couldn'));c=await card();
  ok('dictionary down: saved anyway, meaning empty, the card says so',(await toast())==='Saved to Words'&&c.term==='obdurate'&&c.def===''&&c.ph==='Couldn’t look it up. Write your own.');
  ok('stored with an empty meaning',(await stored('obdurate')).def===''&&same(await underlines('obdurate',P3),['obdurate']));
  await closeCard();failing=false;
  await tapWord('obdurate',P3);
  ok('tapping the underline opens its card',await vis('#wordBox')&&(await card()).term==='obdurate');
  await defFilled();
  ok('shown again: looked up again, and filled',(await card()).def==='Unreasonably stubborn.'&&(await stored('obdurate',w=>w.def)).def==='Unreasonably stubborn.');
  await closeCard();
  await tapWord('ephemeral',P2);
  ok('the card shows the sentence of the tapped place',(await card()).ex==='Nothing here was <b>ephemeral</b> for long.');
  await closeCard();

  // 6. a highlight over saved words: its offsets and text are unchanged, and the word still opens its card
  await page.evaluate(()=>getSelection().removeAllRanges());
  await page.evaluate(p=>{const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(p));el.scrollIntoView({block:'center'});const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);},P1);
  await until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.click('#tool [data-c="mint"]');await until(()=>document.querySelector('#hlCount').textContent==='1');
  const stKey='state:'+(await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:last'))));
  let st;for(let i=0;i<30&&!(st&&st.hl&&st.hl.length);i++){await sleep(100);st=await idb(stKey);} // saved after 500 ms
  ok('a highlight over saved words keeps the block’s offsets',st&&st.hl.length===1&&same(st.hl[0].segs.map(s=>[s.s,s.e]),[[0,P1.length]]));
  ok('the words stay underlined inside it',(await page.$$('mark.hl .wd')).length===3);
  await tapWord('Rivers',P1);
  ok('a word inside a highlight opens its card, not the toolbar',(await card()).term==='Rivers'&&!(await vis('#tool')));
  await closeCard();

  // 7. a second book, for the book filter
  await addMarkdown(t,'harbour.md',BOOK2,'Harbour Notes');
  await saveWord('The tide was','tide');await defFilled();await closeCard();

  // 8. the Words tab
  await toShelf();await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  ok('the Notebook opens on Highlights, with a Words tab',await page.$eval('#nbTabHl',e=>e.getAttribute('aria-selected'))==='true'&&await vis('#nbPanelHl')&&!(await vis('#nbPanelWd'))&&(await text('#nbTabWd'))==='Words');
  await page.click('#nbTabWd');await until(()=>document.querySelectorAll('#wdList .wcard').length===7);
  ok('Words lists every word, newest first',same(await terms(),['tide','obdurate','every night','quixotic','ships','Rivers','ephemeral']));
  ok('the count line: words and due',(await text('#wdStats'))==='7 words · 7 due'&&!(await vis('#nbStats'))&&!(await vis('#nbPanelHl')));
  const eph=await page.$eval(cardOf('ephemeral'),e=>({pos:e.querySelector('.w-pos').textContent,def:e.querySelector('.w-def').textContent,src:e.querySelector('.w-src').textContent,
    ex:[...e.querySelectorAll('.w-ex')].map(x=>[x.querySelector('.w-q').innerHTML,x.querySelector('.w-bk').textContent])}));
  ok('an entry: part of speech, meaning, source, each sentence with the word in bold and its book',eph.pos==='adjective'&&eph.def==='Lasting for a short period of time.'&&eph.src==='from Datamuse'
    &&same(eph.ex,[['Its calm was <b>ephemeral</b>, as calms are!','Word Test'],['Nothing here was <b>ephemeral</b> for long.','Word Test']]));
  ok('the term is set in EB Garamond',(await page.$eval('#wdList .w-term',e=>getComputedStyle(e).fontFamily)).includes('EB Garamond'));
  ok('no horizontal scroll at phone width',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  await search('stubborn');
  ok('search matches meanings',same(await terms(),['obdurate']));
  await search('HARBOUR');
  ok('search matches sentences, ignoring case',same(await terms(),['ships','Rivers']));
  await search('quix');
  ok('search matches terms and sentences',same(await terms(),['every night','quixotic'])); // "every night" was saved from the quixotic sentence
  await search('zzzz');
  ok('no match',(await text('#wdList'))==='Nothing matches.');
  await search('');
  ok('the book filter lists each book',same(await page.$$eval('#wdBook option',o=>o.map(x=>x.text)),['All books','Harbour Notes','Word Test']));
  await page.select('#wdBook',await page.$eval('#wdBook',s=>[...s.options].find(o=>o.text==='Harbour Notes').value));
  ok('the book filter',same(await terms(),['tide']));
  await page.select('#wdBook','');

  // edit a meaning in place; it lasts through a reload
  await page.click(cardOf('tide')+' .w-def');
  await page.$eval(cardOf('tide')+' .w-def',e=>{e.textContent='When the sea comes in and goes out';});
  await page.keyboard.press('Enter');
  w=await stored('tide',w=>w.def.startsWith('When'));
  ok('a meaning edited in the list is saved (Enter)',(await toast())==='Meaning saved'&&w.def==='When the sea comes in and goes out'&&w.defSource===''&&(await text(cardOf('tide')+' .w-src'))==='');
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
  await openWordsTab();await until(()=>document.querySelectorAll('#wdList .wcard').length===7);
  ok('after a reload: the Words tab reopens, with the edited meaning',await page.$eval('#nbTabWd',e=>e.getAttribute('aria-selected'))==='true'&&(await text(cardOf('tide')+' .w-def'))==='When the sea comes in and goes out');

  // a sentence opens its book at that place, scrolled to and flashed
  await openTitle('Word Test');await page.evaluate(()=>scrollTo(0,0));await sleep(500); // the saved position: the top
  await openWordsTab();
  const p2ws=P2.indexOf('ephemeral');
  await page.click(cardOf('ephemeral')+' .w-ex:nth-of-type(2)');await t.reader();
  await until(ws=>document.querySelector(`.wd[data-ws="${ws}"].flash`),p2ws);
  const spot=await page.$eval(`.wd[data-w="${wordId('ephemeral')}"][data-ws="${p2ws}"]`,e=>{const r=e.getBoundingClientRect();return {in:r.top>=0&&r.bottom<=innerHeight,flash:e.classList.contains('flash'),y:scrollY};});
  ok('a sentence opens its book at the word, scrolled to it and flashed',(await text('.hero h1')).includes('Word')&&spot.in&&spot.flash&&spot.y>300);

  // 9. delete → Trash → Restore
  await openWordsTab();
  await page.click(cardOf('quixotic')+' [data-a="del"]');
  ok('Delete asks nothing and moves the word to the Trash',(await toast())==='Moved to Trash · Undo'&&(await terms()).length===6&&!(await terms()).includes('quixotic')&&(await text('#wdStats'))==='6 words · 6 due');
  ok('the word is gone from storage',!(await stored('quixotic',w=>!w)));
  await openTrash();
  const row=await page.$eval('#trashList .tr-row',e=>({sec:e.querySelector('.sec').textContent,q:e.querySelector('.q').textContent}));
  ok('the Trash lists the word with its meaning',row.sec==='Word · quixotic'&&row.q.startsWith('Acting with the desire'));
  await restoreFirst();
  ok('Restore puts it back',(await toast())==='Restored'&&(await stored('quixotic',w=>!!w)).examples.length===1);
  await openWordsTab();
  ok('and it is listed again, with its meaning',(await terms()).includes('quixotic')&&(await text(cardOf('quixotic')+' .w-def')).startsWith('Acting with'));
  // saved again while in the Trash: Restore merges the examples
  await page.click(cardOf('ephemeral')+' [data-a="del"]');
  await openTitle('Harbour Notes');await saveWord('The tide was','ephemeral');await closeCard();
  ok('saved again while in the Trash: a new word with one example',(await stored('ephemeral',w=>w&&w.examples.length===1)).examples.length===1);
  await openTrash();await restoreFirst();
  w=await stored('ephemeral',w=>w.examples.length===3);
  ok('Restore merges the examples',w.examples.length===3&&same(w.examples.map(x=>x.title),['Word Test','Word Test','Harbour Notes'])&&w.def==='Lasting for a short period of time.');
  ok('the dictionaries were only reached through the mock',asked.length>0);

  // 10. screenshots: the toolbar with Word, the card, the underline, the Words tab
  const shot=async(label,opts={})=>{await until(()=>!document.querySelector('#toast').classList.contains('on'));await sleep(250);await page.screenshot({path:join(shots,label+'.png'),...opts});};
  for(const [vw,vh,size] of [[390,844,'phone'],[1280,900,'desktop']]){
    await page.setViewport({width:vw,height:vh,deviceScaleFactor:size==='phone'?2:1});
    for(const theme of ['light','dark']){
      await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);
      await openTitle('Word Test');
      await select(P2,'lanterns');await shot(`toolbar-${size}-${theme}`);
      await page.evaluate(()=>getSelection().removeAllRanges());await hidden('#tool');
      await page.evaluate(p=>{const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(p));el.scrollIntoView({block:'center'});},P2);
      await shot(`underline-${size}-${theme}`);
      await tapWord('quixotic',P2);await shot(`card-${size}-${theme}`);await closeCard();
      await openWordsTab();await page.evaluate(()=>scrollTo(0,0));await shot(`words-${size}-${theme}`,{fullPage:true});
    }
  }
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
});
