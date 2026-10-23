// Fast scroll: under 1180 px, where the rail of sections isn't shown, a handle at the right edge of the reader shows
// while you scroll and fades about 1.5 s after. Dragging it (a finger or a mouse) moves through the whole text, with
// the section's title and the percentage beside it; the reading position is saved after a jump. It stays clear of
// the bar and the text column, under the drawers and the note box, works in Focus mode, and is absent at 1280 px and
// for a text shorter than three screens.
// Usage: node tests/browser/fastscroll.mjs [repo dir]
// Screenshots (a drag at 390×844 light and dark and at 375×667) go to tests/browser/out/fastscroll/.
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('fastscroll',8153);
const {page,ok,must,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','fastscroll');mkdirSync(shots,{recursive:true});

/* ---------- the books ---------- */
const filler=n=>('Filler words for the body of the text, read slowly. '.repeat(n)).trim();
const TITLES=['The harbour','The mole','The lanterns','The ledger','The breakwater','The long way home'];
const LONG=`# Long Text\n\nBy Lee Tester\n\n${filler(10)}\n\n`+TITLES.map(s=>`## ${s}\n\n${filler(40)}\n\n${filler(40)}\n`).join('\n');
const SHORT=`# Short Text\n\nBy Lee Tester\n\n${filler(8)}\n`;

/* ---------- helpers ---------- */
const on=()=>page.$eval('#scrub',e=>e.classList.contains('on'));
const dragging=()=>page.$eval('#scrub',e=>e.classList.contains('drag'));
const tip=()=>page.$eval('#scrub',e=>e.classList.contains('drag')?e.querySelector('.sc-tip').textContent:'');
const scrollBy=dy=>page.evaluate(dy=>scrollBy(0,dy),dy);
// the thumb (its hit area), its visible pill, the text column and the bar
const geo=()=>page.evaluate(()=>{const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,h:b.height,x:b.left+b.width/2,y:b.top+b.height/2};};
  return {thumb:r('#scrub .sc-thumb'),pill:r('#scrub .sc-thumb i'),col:r('#col'),bar:r('#bar'),w:innerWidth,h:innerHeight};});
const end=()=>page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
// what the label should say at the current position: the section whose heading is above it (as the rail counts; the
// opening paragraph is section 1, titled from its first words, as in the contents) and the percentage
const expected=()=>page.evaluate(()=>{let i=0;
  document.querySelectorAll('.leg').forEach(l=>{if(scrollY>=l.getBoundingClientRect().top+scrollY-110-5) i=+l.dataset.sec;});
  return `${i+1}. ${document.querySelectorAll('.toc-inline .tt')[i].textContent} · ${Math.round(scrollY/(document.documentElement.scrollHeight-innerHeight)*100)}%`;});
// Drag the thumb from its middle to y (px from the top) with a finger or the mouse; `hold` keeps it pressed.
async function drag(y,{mouse=false,hold=false}={}){
  const g=await geo(),x=g.thumb.x,y0=g.thumb.y;
  if(mouse){await page.mouse.move(x,y0);await page.mouse.down();for(let i=1;i<=8;i++) await page.mouse.move(x,y0+(y-y0)*i/8);if(!hold) await page.mouse.up();}
  else{await page.touchscreen.touchStart(x,y0);for(let i=1;i<=8;i++) await page.touchscreen.touchMove(x,y0+(y-y0)*i/8);if(!hold) await page.touchscreen.touchEnd();}
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
}
const release=mouse=>mouse?page.mouse.up():page.touchscreen.touchEnd();
const idb=key=>page.evaluate(key=>new Promise((res,rej)=>{const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const db=r.result,q=db.transaction('kv').objectStore('kv').get(key);q.onsuccess=()=>{db.close();res(q.result);};q.onerror=()=>rej(q.error);};}),key);
const shot=label=>page.screenshot({path:join(shots,label+'.png')});
const phone=(width,height)=>page.setViewport({width,height,deviceScaleFactor:2,hasTouch:true,isMobile:true});

await t.run(async()=>{
  await phone(390,844);await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await enterLocalMode(t,must);
  await addMarkdown(t,'short-text.md',SHORT,'Short Text');
  await scrollBy(200);await sleep(100);
  ok('a text under three screens long gets no handle',!(await on()));
  await addMarkdown(t,'long-text.md',LONG,'Long Text');
  const book=await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:last')));
  must('the long text is over three screens',(await end())>844*3);

  /* ---------- 1. it shows while you scroll and fades after ---------- */
  await sleep(1800);
  ok('no handle before you scroll',!(await on()));
  await scrollBy(400);await sleep(100);
  ok('scrolling shows the handle',await on()&&await page.$eval('#scrub',e=>getComputedStyle(e).display!=='none'));
  await sleep(900);
  ok('it is still there a second later',await on());
  await sleep(1000);
  ok('it fades about 1.5 s after the scroll stops',!(await on()));
  await scrollBy(300);await sleep(100);
  let g=await geo();
  ok('its touch target is at least 44 px tall, at the right edge',g.thumb.h>=44&&g.thumb.right>=g.w-1);
  ok('it stays clear of the bar and the text column',g.thumb.top>=g.bar.bottom&&g.pill.left>=g.col.right&&g.thumb.bottom<=g.h);

  /* ---------- 2. dragging it ---------- */
  await drag(g.h,{hold:true});
  ok('dragged to the bottom with a finger, it reaches the end',Math.abs((await page.evaluate(()=>scrollY))-(await end()))<=2);
  ok('…and the label beside it says the last section and 100%',(await tip())===`7. ${TITLES[5]} · 100%`&&(await expected())===`7. ${TITLES[5]} · 100%`);
  await shot('390-end');
  await release();await sleep(50);
  ok('let go, the label hides',!(await dragging())&&(await tip())==='');
  g=await geo();await drag(g.h*.45,{hold:true});
  const mid=await page.evaluate(()=>scrollY);
  ok('dragged to the middle, the text moves there',mid>(await end())*.2&&mid<(await end())*.8);
  ok('…and the label shows the section there and the percentage',(await tip())===(await expected()));
  await shot('390-middle');
  await release();await sleep(1000);
  ok('the reading position is saved after the jump',Math.abs(((await idb('state:'+book))||{}).pos-mid)<=2);
  await sleep(1200);
  ok('after a drag the handle fades too',!(await on()));
  await scrollBy(-10);await sleep(50);await drag(0,{mouse:true,hold:true});
  ok('the mouse drags it to the top',(await page.evaluate(()=>scrollY))===0&&(await tip())===(await expected())&&(await tip()).endsWith(' · 0%'));
  await release(true);
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  await scrollBy(10);await sleep(50);g=await geo();await drag(g.h*.6,{hold:true});await shot('390-dark');await release();
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);

  /* ---------- 3. under the drawers and the note box; Focus mode ---------- */
  await t.openDrawer('#bHl','#drawer');
  await scrollBy(50);await sleep(50);g=await geo();
  ok('the highlights drawer covers it',await page.evaluate(g=>!!document.elementFromPoint(g.thumb.x,g.thumb.y)?.closest('#drawer'),g));
  await t.closeDrawer();
  await t.select('#col p.hp');await page.tap('#tool [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await sleep(100);g=await geo();
  ok('the note box covers it',await on()&&await page.evaluate(g=>!!document.elementFromPoint(g.thumb.x,g.thumb.y)?.closest('#noteBox'),g));
  await page.tap('#noteCancel');
  await page.tap('#bFocus');await scrollBy(-300);await sleep(100);
  ok('in Focus mode, where the bar stays, it shows too',await on());
  g=await geo();await drag(g.h*.3);
  ok('…and drags',Math.abs((await page.evaluate(()=>scrollY))-mid)>100);
  await page.tap('#bFocus');

  /* ---------- 4. a smaller phone, then a desktop ---------- */
  await phone(375,667);await sleep(150);await scrollBy(-100);await sleep(50);
  g=await geo();await drag(g.h*.5,{hold:true});
  ok('375×667: dragging shows the section and the percentage',(await tip())===(await expected()));
  await shot('375-middle');await release();
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});await sleep(150);
  await scrollBy(300);await sleep(100);
  ok('at 1280 px, where the rail shows, there is no handle',await page.$eval('#scrub',e=>getComputedStyle(e).display==='none'));
});
