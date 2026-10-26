// Each book's length on the shelf: the cover's length line and label, the page block beside the cover whose
// thickness grows with the length, and the list view's sortable Length column. Usage: node tests/browser/length.mjs [repo dir]
// Screenshots: tests/browser/out/length/ (shelf, list and a close-up of three books, at 390 and 1280 px, light and dark).
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {start,sleep,enterLocalMode,addQuietEngine,highlightQuietEngine,addMarkdown} from './lib.mjs';

const t=await start('length',8128);
const {page,ok,must,until,vis}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','length');mkdirSync(shots,{recursive:true});

const words=n=>Array.from({length:n},(_,i)=>['quiet','shelf','reading','page','lamp'][i%5]).join(' ');
// n paragraphs of 100 words, with a heading every 50 paragraphs
const body=n=>Array.from({length:n},(_,i)=>(i%50?'':`## Part ${i/50+1}\n\n`)+words(100)).join('\n\n');
// short, medium, long; pages: the page block's thickness in px, 9.04·log10(words) − 16.8 clamped to 3–32
const BOOKS=[
  {title:'A Short Note',md:`# A Short Note\n\nBy Pat Brief\n\nMay 2, 2024\n\n${words(40)}\n`,cover:'40 words',pages:3},
  {title:'On the Patient Craft of Keeping Commonplace Books Through a Long Life',md:`# On the Patient Craft of Keeping Commonplace Books Through a Long Life\n\nBy Marguerite Holloway-Ashdown\n\nJune 1, 2019\n\n${body(42)}\n`,cover:'4.2k words',pages:16},
  {title:'The Long Atlas',md:`# The Long Atlas\n\nBy Ilya Tolmach\n\nJanuary 1, 1869\n\n${body(2000)}\n`,cover:'200k words',pages:31},
];
const [SHORT,MID,LONG]=BOOKS;
const cov=title=>`.cover[aria-label^="${title}"]`;
// the reader's own count, as the hero shows it ("4,213"): the cover's label must say the same
const heroWords=()=>page.$$eval('.log span',s=>{const w=s.find(e=>/ words?$/.test(e.textContent));return w&&w.querySelector('b').textContent;});
// a book's parts, measured on the page: cover, page block, the whole book and the ⋯ button
const parts=title=>page.$eval(cov(title),c=>{const b=c.parentElement,r=e=>e&&e.getBoundingClientRect().toJSON(),s=e=>getComputedStyle(e).transform;
  return {cover:r(c),pages:r(b.querySelector('.pages')),book:r(b),more:r(b.querySelector('.c-more')),tc:s(c),tp:s(b.querySelector('.pages'))};});
// in the page: whether the stored shelf entry of the book titled t has its progress (saved 0.5 s after a scroll)
const stored=t=>new Promise(res=>{const r=indexedDB.open('upwind',1);r.onsuccess=()=>{
  const q=r.result.transaction('kv').objectStore('kv').getAll(IDBKeyRange.bound('meta:','meta:\uffff'));q.onsuccess=()=>{r.result.close();res(q.result.some(m=>m.title===t&&m.progress>0));};};});
const noSideScroll=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
const scheme=s=>page.emulateMediaFeatures([{name:'prefers-color-scheme',value:s}]);
const shoot=async(label,opts={fullPage:true})=>{
  for(const s of ['light','dark']){await scheme(s);await page.screenshot({path:join(shots,`${label}-${s}.png`),...opts});}
  await scheme('light');
};
// The three books side by side with their plank. They lead the "Date added" row, newest first: long, medium, short.
// A phone's row scrolls after two books, so the picture lets the row (and its plank) run past the screen.
const closeUp=async label=>{
  const spill=await page.addStyleTag({content:'.books{overflow:visible}.shelf-row{width:max-content;min-width:100%}'});
  await page.evaluate(()=>scrollTo(0,0));
  const clip=await page.evaluate(sels=>{const rs=sels.map(s=>document.querySelector(s).parentElement.getBoundingClientRect());
    const x=Math.min(...rs.map(r=>r.left))-16,y=Math.min(...rs.map(r=>r.top))-24;
    return {x,y,width:Math.max(...rs.map(r=>r.right))+16-x,height:Math.max(...rs.map(r=>r.bottom))+40-y};},BOOKS.map(b=>cov(b.title)));
  await shoot(label,{clip,captureBeyondViewport:true});
  await spill.evaluate(e=>e.remove());
};

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addQuietEngine(t,must);
  await highlightQuietEngine(t,must);
  for(const b of BOOKS){
    await addMarkdown(t,`${b.cover.replace(/\W/g,'')}.md`,b.md,b.title);
    b.exact=await heroWords();
    // the short note scrolled to the end; the medium one partly, so its footer shows a percentage
    if(b===SHORT){await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await sleep(600);}
    if(b===MID){await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight*.4));await until(stored,MID.title);}
  }
  must('the reader counts the short note as 40 words',SHORT.exact==='40');
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');

  // an old shelf entry saved before shelf entries carried a word count
  await page.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=rej;r.onsuccess=()=>{
    const s=r.result.transaction('kv','readwrite').objectStore('kv');
    const all=s.getAll(IDBKeyRange.bound('meta:','meta:￿'));all.onsuccess=()=>{
      const m={...all.result.find(x=>x.title==='The Quiet Engine'),id:'old-entry',title:'An Older Entry',author:'',written:'',writtenSort:''};delete m.words;
      s.put(m,'meta:old-entry').onsuccess=()=>res();};}}));
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden)');
  await until(()=>document.querySelectorAll('.book').length===5);

  // the length line and label
  for(const b of BOOKS){
    ok(`cover shows "${b.cover}"`,await page.$eval(cov(b.title)+' .c-l',e=>e.textContent).catch(()=>null)===b.cover);
    ok(`cover label gives the exact count (${b.exact} words)`,(await page.$eval(cov(b.title),e=>e.getAttribute('aria-label'))).includes(`, ${b.exact} words, `));
  }
  const qe=await page.$eval(cov('The Quiet Engine'),e=>({l:e.querySelector('.c-l')?.textContent,f:e.querySelector('.c-f').textContent}));
  ok('the footer keeps the year and highlight count',/^\d+ words?$/.test(qe.l)&&qe.f.startsWith('2025')&&qe.f.includes('✎ 2'));
  ok('the footer keeps the year and progress',/^2019 · [1-9]\d*%$/.test(await page.$eval(cov(MID.title)+' .c-f',e=>e.textContent)));
  const old=await page.$eval(cov('An Older Entry'),e=>({l:!!e.querySelector('.c-l'),a:e.getAttribute('aria-label')}));
  ok('an entry without a count shows no length',!old.l&&old.a==='An Older Entry, 0% read');
  ok('no NaN or undefined on the shelf',!/NaN|undefined/.test(await page.$eval('#shelfBody',e=>e.innerHTML)));
  // the length line fits its cover and sits above the footer, the footer clears the gilt rule,
  // and the title and author show their full clamp (5 and 2 lines) rather than being squeezed and cut mid-line
  const fit=()=>page.$$eval('.cover',cs=>cs.every(c=>{const l=c.querySelector('.c-l'),f=c.querySelector('.c-f').getBoundingClientRect(),r=c.getBoundingClientRect();
    const whole=[...c.querySelectorAll('.c-t,.c-a')].every(e=>{const s=getComputedStyle(e);return e.clientHeight>=Math.min(e.scrollHeight,parseInt(s.webkitLineClamp)*parseFloat(s.lineHeight))-1;});
    return whole&&(!l||(l.scrollWidth<=l.clientWidth&&l.getBoundingClientRect().bottom<=f.top+.5))&&f.bottom<=r.bottom-14;}));
  ok('length line fits every cover, above the footer',await fit());
  const shortest=await page.addStyleTag({content:'.cover{--h:186px!important}'});
  ok('at the shortest cover height a long title and author still fit whole',await fit());
  await shortest.evaluate(e=>e.remove());

  // the page block: thickness from the length, outside the 146 px cover, counted in the book's width
  const P=Object.fromEntries(await Promise.all([...BOOKS.map(b=>b.title),'An Older Entry'].map(async k=>[k,await parts(k)])));
  const thick=k=>Math.round(P[k].pages.right-P[k].cover.right);
  ok('page block thickness grows with length (3, 16, 31 px)',BOOKS.every(b=>thick(b.title)===b.pages)&&thick(LONG.title)>thick(MID.title)&&thick(MID.title)>thick(SHORT.title));
  ok('an entry without a count gets the thinnest block',thick('An Older Entry')===3);
  ok('covers stay 146 px wide',Object.values(P).every(p=>p.cover.width===146));
  ok('a book is as wide as its cover plus its pages',Object.keys(P).every(k=>Math.abs(P[k].book.width-146-thick(k))<.5));
  ok('the pages sit 3 px inside the boards, top and bottom',Object.values(P).every(p=>Math.abs(p.pages.top-p.cover.top-3)<.5&&Math.abs(p.cover.bottom-p.pages.bottom-3)<.5));
  const gaps=await page.$$eval('.books .book',bs=>bs.slice(1).map((b,i)=>b.getBoundingClientRect().left-bs[i].getBoundingClientRect().right));
  ok('the gap between books stays 1.1rem',gaps.length===4&&gaps.every(g=>Math.abs(g-17.6)<.5));
  ok('the ⋯ button stays on the front cover',Object.values(P).every(p=>Math.abs(p.cover.right-p.more.right-6)<.5));
  // hover: the cover and its pages lift as one, by the same transform
  await page.hover(cov(LONG.title));
  await page.waitForFunction(s=>{const c=document.querySelector(s);return getComputedStyle(c).transform!=='none'&&!c.getAnimations().length&&!c.nextElementSibling.getAnimations().length;},{timeout:5000},cov(LONG.title)).catch(()=>{});
  const up=await parts(LONG.title),was=P[LONG.title];
  ok('hovering lifts the cover and its page block together',up.tc!=='none'&&up.tc===up.tp&&was.cover.top-up.cover.top>5&&was.pages.top-up.pages.top>5&&Math.abs(up.pages.right-up.cover.right-thick(LONG.title))<1.5);
  await page.mouse.move(1,1);
  await until(s=>getComputedStyle(document.querySelector(s)).transform==='none'&&!document.querySelector(s).getAnimations().length,cov(LONG.title));
  ok('no sideways scroll on the shelf at 390 px',await noSideScroll());
  await closeUp('closeup-390');

  await page.click('#segGroup [data-g="written"]'); // one row per year: every cover in view on a phone
  await shoot('shelf-390');

  // list view on a phone: Length joins Added and Highlights off screen, so the table still fits
  await page.click('#segView [data-v="list"]');await page.waitForSelector('.tbl');
  ok('the phone list hides the Length column',!(await vis('.tbl th.c-words'))&&!(await vis('.tbl td.c-words')));
  ok('no sideways scroll in the list at 390 px',await noSideScroll());
  await shoot('list-390');

  // list view on a desktop: a Length column that sorts
  await page.setViewport({width:1280,height:900,deviceScaleFactor:2});
  const lengths=()=>page.$$eval('.tbl tbody td.c-words',ts=>ts.map(e=>e.textContent));
  ok('list view has a Length column',(await page.$eval('.tbl th.c-words button',e=>e.textContent))==='Length'&&await vis('.tbl td.c-words'));
  await page.click('.tbl [data-sort="words"]');
  const desc=await lengths();
  ok('Length sorts longest first',JSON.stringify(desc)===JSON.stringify(['200k words','4.2k words',qe.l,'40 words','—']));
  ok('the sorted header says so',(await page.$eval('.tbl [data-sort="words"]',e=>e.getAttribute('aria-sort')))==='descending');
  await page.click('.tbl [data-sort="words"]');
  ok('a second click sorts shortest first, an unknown length ("—") as the shortest',JSON.stringify(await lengths())===JSON.stringify(['—','40 words',qe.l,'4.2k words','200k words']));
  ok('no sideways scroll in the list at 1280 px',await noSideScroll());
  await page.click('.tbl [data-sort="words"]'); // back to longest first for the screenshots
  await shoot('list-1280');

  await page.click('#segView [data-v="shelves"]');await page.click('#segGroup [data-g="added"]');
  ok('length line fits every cover at 1280 px',await fit());
  await shoot('shelf-1280');
  await closeUp('closeup-1280');
  await page.hover(cov(MID.title));await sleep(400);
  await shoot('closeup-1280-hover',{clip:await page.$eval(cov(MID.title),c=>{const r=c.parentElement.getBoundingClientRect();return {x:r.left-24,y:r.top-30,width:r.width+48,height:r.height+56};})});
});
