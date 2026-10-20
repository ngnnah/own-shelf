// Study: flashcards for saved words. Usage: node tests/browser/study.mjs [repo dir]
// Words are written straight into the local store (IndexedDB "upwind", store "kv"), then /?study=1 opens Study.
// Screenshots of each state at 390×844 and 1280×900, light and dark, go to tests/browser/out/study/.
import {start,enterLocalMode,sleep} from './lib.mjs';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('study',8141);
const {page,ok,must,vis,text,until}=t;
const shotDir=join(dirname(fileURLToPath(import.meta.url)),'out','study');mkdirSync(shotDir,{recursive:true});
const DAY=864e5,MIN=6e4;

/* ---------- the words ---------- */
const now=Date.now();
const ex=(text,word,title)=>{const s=text.indexOf(word);return {text,s,e:s+word.length,bookId:'b1',pid:'p1',ws:0,we:0,title,at:now};};
const LONG='In the long afternoon, which stretched across the valley like a sheet hung out to dry, everything that had seemed permanent in the morning turned out to be ephemeral, as passing as the shadows of the clouds that moved over the fields, the river and the slow brown roofs of the town.';
// ids run against the expected order, so the queue's order comes from sorting, not from the store's key order
const A={id:'wz',term:'ephemeral',def:'Lasting for a very short time.',pos:'adjective',defSource:'Datamuse',added:now-30*DAY,
  examples:[ex(LONG,'ephemeral','The Quiet Engine'),ex('Fame in the city was ephemeral.','ephemeral','Notes from a Small Town'),ex('Its calm was ephemeral, as calms are!','ephemeral','Sea Stories')],
  srs:{due:now-2*DAY,interval:3,ease:2.5,reps:2,lapses:0}};
const B={id:'wb',term:'laconic',def:'',pos:'adjective',defSource:'',added:now-20*DAY,
  examples:[ex('Her reply was laconic: no.','laconic','Short Answers'),ex('A laconic man, he nodded once.','laconic','The Long Road')],
  srs:{due:now-60*MIN,interval:1,ease:2.5,reps:1,lapses:0}};
const C={id:'wc',term:'pellucid',def:'Translucently clear.',pos:'adjective',defSource:'Datamuse',added:now-10*DAY,
  examples:[ex('The pellucid water showed every stone.','pellucid','Rivers')],srs:{due:now+5*DAY,interval:5,ease:2.5,reps:2,lapses:0}};
const TERMS=['abate','bucolic','candor','dearth','ebullient','fecund','garrulous','halcyon','iconoclast','jejune','kinetic','lucid','mendacious','nascent','obdurate','paucity','quixotic','recalcitrant','sanguine','taciturn','ubiquitous','vacillate'];
const NEW=TERMS.map((term,i)=>({id:'n'+String(TERMS.length-i).padStart(2,'0'),term,def:i===0?'To become less intense.':'',pos:'',defSource:'',added:now-(100-i)*MIN,
  examples:[ex(`The word ${term} turned up in chapter ${i+1}.`,term,'Word Book')]}));

/* ---------- helpers ---------- */
// write words into the local store; clear removes every word first
const seed=(words,clear=false)=>page.evaluate((words,clear)=>new Promise((res,rej)=>{
  const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite'),s=tx.objectStore('kv');
    if(clear) s.delete(IDBKeyRange.bound('word:','word:￿'));
    words.forEach(w=>s.put(w,'word:'+w.id));tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};
}),words,clear);
const readWord=id=>page.evaluate(id=>new Promise((res,rej)=>{
  const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get('word:'+id);g.onsuccess=()=>{r.result.close();res(g.result);};g.onerror=()=>rej(g.error);};
}),id);
// the stored word once cond holds (the app saves without waiting), or the last read after 5 s
async function stored(id,cond){let w;for(const end=Date.now()+5000;Date.now()<end;await sleep(50)){w=await readWord(id);if(w&&cond(w))return w;}return w;}
const near=(t,want)=>Math.abs(t-want)<2*MIN;
// the day's new-word count, as the app keys it (local date)
const setNewToday=n=>page.evaluate(n=>{const d=new Date();localStorage.setItem('upwind:studyNew',JSON.stringify({day:`${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`,n}));},n);
async function openStudy(){
  await page.goto(t.base+'?study=1',{waitUntil:'networkidle0'});
  await page.waitForSelector('#study:not(.hidden)');
  await until(()=>!document.querySelector('#syCard').textContent.includes('Gathering'));
}
const card=()=>page.evaluate(()=>{
  const q=s=>document.querySelector('#syCard '+s),all=s=>[...document.querySelectorAll('#syCard '+s)];
  return {prog:document.querySelector('#syProg').textContent,term:q('.sy-term')?.textContent||'',pos:q('.sy-pos')?.textContent||'',
    sent:q('.sy-sent')?.textContent||'',bold:q('.sy-sent b')?.textContent||'',gap:q('.sy-gap')?.textContent||'',hint:q('.sy-hint')?.textContent||'',
    back:!!q('.sy-back'),def:q('.sy-def')?.textContent||'',more:all('.sy-more li').map(li=>[li.querySelector('.sy-sent').textContent,li.querySelector('.sy-from')?.textContent||'']),
    show:document.querySelector('#syActs [data-sy="show"]')?.textContent||'',rates:[...document.querySelectorAll('#syActs .sy-r')].map(b=>b.textContent)};
});
const nextCard=prog=>until(p=>document.querySelector('#syProg').textContent===p,prog);
const press=async k=>{await page.keyboard.press(k);await sleep(30);};
// screenshots of the current state at phone and desktop size, light and dark. Checks the page never scrolls
// sideways and the buttons are on screen; returns the problems found
async function shoot(label){
  const bad=[];
  for(const [w,h] of [[390,844],[1280,900]]) for(const theme of ['light','dark']){
    await page.setViewport({width:w,height:h,deviceScaleFactor:w<500?2:1});
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const m=await page.evaluate(()=>{const a=document.querySelector('#syActs').getBoundingClientRect();
      return {wide:document.documentElement.scrollWidth>document.documentElement.clientWidth,acts:a.height>0&&a.top>=0&&a.bottom<=innerHeight+1};});
    if(m.wide) bad.push(`${w}px ${theme}: horizontal scroll`);
    if(!m.acts) bad.push(`${w}px ${theme}: buttons off screen`);
    await page.screenshot({path:join(shotDir,`${label}-${w}-${theme}.png`)});
  }
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  if(bad.length) console.log(bad.join('\n'));
  return bad;
}

await t.run(async()=>{
  await enterLocalMode(t,must);

  /* ---------- no words: the empty state, through the deep link ---------- */
  await openStudy();
  ok('?study=1 opens Study after a local start',await vis('#study')&&!(await vis('#shelf')));
  ok('the address is cleaned',await page.evaluate(()=>location.search===''));
  ok('empty state explains how to save a word',(await text('#syCard')).includes('No words yet')&&(await text('#syCard')).includes('Select a word while reading and tap Word'));
  ok('no progress or card-type toggle without cards',(await text('#syProg'))===''&&!(await vis('#syMode')));
  ok('empty: no sideways scroll, button on screen',!(await shoot('empty')).length);
  await page.click('#syActs [data-sy="back"]');await page.waitForSelector('#shelf:not(.hidden)');
  ok('Back to shelf leaves Study',!(await vis('#study')));

  /* ---------- the queue ---------- */
  await seed([A,B,C,...NEW]);
  await page.evaluate(()=>localStorage.setItem('upwind:studyNew',JSON.stringify({day:'2000-1-1',n:20}))); // an old day doesn't count
  await openStudy();
  let c=await card();
  ok('queue: the 2 due words and 20 of the 22 new ones (pellucid isn’t due)',c.prog==='1 of 22');
  ok('queue: the most overdue word first',c.term==='ephemeral');
  await page.click('#syBack');await page.waitForSelector('#shelf:not(.hidden)');
  await setNewToday(18);
  await openStudy();
  c=await card();
  ok('queue: 18 new words already studied today leave 2',c.prog==='1 of 4');

  /* ---------- card 1, ephemeral (due): front, back, Good with key 2 ---------- */
  ok('front: the word, its part of speech, a sentence with the word in bold',c.term==='ephemeral'&&c.pos==='adjective'&&c.sent===LONG&&c.bold==='ephemeral');
  ok('front: no back and no ratings yet, a Show meaning button',!c.back&&!c.rates.length&&c.show==='Show meaning');
  ok('card type: Word → meaning by default',await page.$eval('#syMode [data-m="word"]',b=>b.getAttribute('aria-pressed'))==='true');
  ok('front: no sideways scroll, button on screen (long sentence wraps)',!(await shoot('front')).length);
  await press('1');
  ok('rating keys do nothing before the back shows',(await card()).prog==='1 of 4'&&!(await card()).back);
  await press('Space');
  c=await card();
  ok('Space shows the back: the meaning',c.back&&c.def==='Lasting for a very short time.');
  ok('back: two more examples with their book titles',JSON.stringify(c.more)===JSON.stringify([['Fame in the city was ephemeral.','Notes from a Small Town'],['Its calm was ephemeral, as calms are!','Sea Stories']]));
  ok('back: Again / Good / Easy with their next intervals',JSON.stringify(c.rates)===JSON.stringify(['Again10 min','Good8 days','Easy10 days']));
  ok('back: no sideways scroll, ratings on screen',!(await shoot('back')).length);
  await press('2');await nextCard('2 of 4');
  let w=await stored('wz',w=>w.srs.reps===3);
  ok('Good (key 2) saves the schedule: 8 days, one more rep, one more review',w.srs.interval===8&&w.srs.reps===3&&w.srs.seen===1&&near(w.srs.due,Date.now()+8*DAY));

  /* ---------- card 2, laconic: no meaning; Enter, then Again with key 1 ---------- */
  c=await card();
  ok('next card: laconic, its first sentence',c.term==='laconic'&&c.sent==='Her reply was laconic: no.');
  await press('Enter');
  c=await card();
  ok('Enter shows the back; no meaning saved yet',c.back&&c.def==='No meaning saved yet'&&c.more.length===1);
  await press('1');await nextCard('3 of 5');
  w=await stored('wb',w=>w.srs.lapses===1);
  ok('Again (key 1) saves 10 min, back to the start, a lapse',w.srs.reps===0&&w.srs.lapses===1&&w.srs.interval===0&&near(w.srs.due,Date.now()+10*MIN));
  ok('Again puts the card back in the session (the total grows)',(await card()).prog==='3 of 5');

  /* ---------- cards 3 and 4, new words, oldest first: buttons, then Easy with key 3 ---------- */
  c=await card();
  ok('new words come after the due ones, oldest first',c.term==='abate'&&c.pos==='');
  await page.click('#syActs [data-sy="show"]');
  c=await card();
  ok('Show meaning button shows the back; a new word’s labels',c.back&&JSON.stringify(c.rates)===JSON.stringify(['Again10 min','Good1 day','Easy4 days']));
  await page.click('#syActs [data-r="good"]');await nextCard('4 of 5');
  w=await stored('n22',w=>w.srs);
  ok('Good button on a new word: 1 day',w.srs.interval===1&&w.srs.reps===1&&near(w.srs.due,Date.now()+DAY));
  ok('next new word: bucolic',(await card()).term==='bucolic');
  await press('Space');await press('3');await nextCard('5 of 5');
  w=await stored('n21',w=>w.srs);
  ok('Easy (key 3) on a new word: 4 days, ease up',w.srs.interval===4&&w.srs.ease>2.5&&near(w.srs.due,Date.now()+4*DAY));

  /* ---------- card 5, laconic again: the next sentence in the rotation ---------- */
  c=await card();
  ok('the Again card comes back with its next sentence',c.term==='laconic'&&c.sent==='A laconic man, he nodded once.');
  await press('Space');await press('2');
  await until(()=>document.querySelector('#syCard').textContent.includes('All caught up'));
  w=await stored('wb',w=>w.srs.reps===1);
  ok('Good after Again: 1 day, the lapse kept',w.srs.interval===1&&w.srs.lapses===1&&w.srs.seen===2);

  /* ---------- done ---------- */
  const done=await text('#syCard');
  ok('done: All caught up, how many reviewed, next review tomorrow',done.includes('All caught up')&&done.includes('You reviewed 4 words.')&&done.includes('Next review tomorrow.'));
  ok('done: no progress or toggle',(await text('#syProg'))===''&&!(await vis('#syMode')));
  ok('done: no sideways scroll, button on screen',!(await shoot('done')).length);
  ok('the day’s count includes the 2 new words rated',await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:studyNew')).n)===20);
  await openStudy();
  ok('with the day’s new words used up and nothing due: done at once',(await text('#syCard')).includes('Nothing is due right now.')&&(await text('#syCard')).includes('Next review tomorrow.'));

  /* ---------- Sentence → word ---------- */
  const X={id:'wx',term:'sonorous',def:'Deep and full in sound.',pos:'adjective',defSource:'Datamuse',added:now-9*DAY,
    examples:[ex('The bell was sonorous in the cold air.','sonorous','Winter Bells')],srs:{due:now-DAY,interval:3,ease:2.5,reps:2,lapses:0}};
  const Y={id:'wy',term:'quixotic',def:'',pos:'adjective',defSource:'',added:now-8*DAY,examples:[ex('It was a quixotic plan to sail alone.','quixotic','The Long Road')]};
  await seed([X,Y],true);await page.evaluate(()=>localStorage.removeItem('upwind:studyNew'));
  await openStudy();
  ok('two cards',(await card()).prog==='1 of 2'&&(await card()).term==='sonorous');
  await page.click('#syMode [data-m="cloze"]');
  c=await card();
  ok('Sentence → word: the sentence with the word blanked, the meaning as a hint',c.term===''&&c.sent==='The bell was _____ in the cold air.'&&c.gap==='_____'&&c.hint==='MeaningDeep and full in sound.'&&c.show==='Show word');
  ok('the card type is saved in prefs',await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:prefs')).studyMode)==='cloze'&&await page.$eval('#syMode [data-m="cloze"]',b=>b.getAttribute('aria-pressed'))==='true');
  ok('cloze: no sideways scroll, button on screen',!(await shoot('cloze')).length);
  await press('Space');
  c=await card();
  ok('cloze back: the word, and the sentence filled in',c.term==='sonorous'&&c.bold==='sonorous'&&c.sent==='The bell was sonorous in the cold air.'&&c.rates.length===3);
  ok('cloze back: no sideways scroll, ratings on screen',!(await shoot('cloze-back')).length);
  await press('2');await nextCard('2 of 2');
  w=await stored('wx',w=>w.srs.reps===3);
  ok('cloze rating saves the schedule',w.srs.interval===8);
  await openStudy(); // reload: the card type stays
  c=await card();
  ok('the card type survives a reload; no hint without a meaning',await page.$eval('#syMode [data-m="cloze"]',b=>b.getAttribute('aria-pressed'))==='true'&&c.prog==='1 of 1'&&c.sent==='It was a quixotic plan to sail alone.'.replace('quixotic','_____')&&c.hint==='');
  await press('Space');await press('3');
  await until(()=>document.querySelector('#syCard').textContent.includes('All caught up'));
  const done2=await text('#syCard');
  ok('done: one word reviewed, next review in 4 days',done2.includes('You reviewed 1 word.')&&done2.includes('Next review in 4 days.'));
});
