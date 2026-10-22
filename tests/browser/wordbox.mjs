// The word card and the note box stay inside the visible area, with their buttons in view: a long or pasted
// multi-line meaning, the field dragged taller by its grip, a keyboard-height window (resized, as on Android) and an
// iPhone keyboard (visualViewport shrunk and panned over a full-height page, faked). Then dragging the word card by its
// head: it moves, stays inside, typing doesn't drag it, its buttons still work, and it reopens where it used to.
// Dictionaries are mocked (none has the word). Usage: node tests/browser/wordbox.mjs [repo dir]
// Screenshots (390×844, 1280×900, the keyboard sizes, after a drag) go to tests/browser/out/wordbox/.
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
import {mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('wordbox',8147);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','wordbox');mkdirSync(shots,{recursive:true});

await page.setBypassServiceWorker(true); // so every request reaches the interception below
await page.setRequestInterception(true);
page.on('request',req=>{
  const h=new URL(req.url()).hostname;
  if(h==='api.datamuse.com') return req.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'[]'});
  if(h==='en.wiktionary.org') return req.respond({status:404,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{}'});
  req.continue();
});

/* ---------- the book and the meanings ---------- */
const filler=n=>('Filler words for the body of the text, read slowly. '.repeat(n)).trim();
const P1='The keeper wrote in his ledger every night, and the lanterns burned until the harbour was dark.';
const P2='Some days the sea was obdurate and grey, and the gulls kept away from the rocks by the mole.';
const BOOK=`# Card Test\n\nBy Lee Tester\n\n${filler(25)}\n\n${P1}\n\n${filler(40)}\n\n${P2}\n\n${filler(40)}\n`;
// a meaning pasted from elsewhere: line breaks, bullets and tab indents
const PASTED=`the baltic states
(or Baltic countries) are 3 nations in northeastern Europe on the eastern shore of the Baltic Sea: Estonia, Latvia, and Lithuania:
• Estonia
\t• Capital: Tallinn
\t• Population: ~1.3 million
\t• Language: Estonian (Uralic language family)
• Latvia
\t• Capital: Riga
\t• Population: ~1.8 million
\t• Language: Latvian (Baltic language family)
• Lithuania (the largest country in the region)
\t• Capital: Vilnius
\t• Population: ~2.7 million
\t• Language: Lithuanian (Baltic language family)`;
const LONG=' A meaning written by hand that goes on for a while, longer than the field.'.repeat(9); // 675 characters

/* ---------- helpers ---------- */
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
// Select `word` in the block that contains `inBlock`, centred on screen or at `y` px from the top; wait for the toolbar.
async function select(inBlock,word,y){
  await page.evaluate((inBlock,word,y)=>{
    const el=[...document.querySelectorAll('#col .hp')].find(e=>e.textContent.includes(inBlock));
    el.scrollIntoView({block:'center'});if(y!=null) scrollBy(0,el.getBoundingClientRect().top-y);
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;
    while((n=w.nextNode())&&!n.data.includes(word));
    const i=n.data.indexOf(word),r=document.createRange();r.setStart(n,i);r.setEnd(n,i+word.length);getSelection().removeAllRanges();getSelection().addRange(r);
  },inBlock,word,y);
  return until(()=>!document.querySelector('#tool').classList.contains('hidden'));
}
async function openCard(inBlock,word,y){
  await select(inBlock,word,y);await page.click('#tool [data-a="word"]');
  await page.waitForSelector('#wordBox:not(.hidden)');
  await until(()=>document.querySelector('#wbDef').placeholder.startsWith('No meaning'));
}
async function closeCard(){if(await vis('#wordBox')){await page.click('#wbClose');await hidden('#wordBox');}}
// Where a box is, and whether each of its buttons is inside the visible area (visualViewport) and on top at its centre
// (not clipped by the box's own scrolling or covered).
const fit=(box,buttons)=>page.evaluate((box,buttons)=>{
  const v=visualViewport,top=v.offsetTop,bottom=v.offsetTop+v.height,right=v.offsetLeft+v.width;
  const inside=r=>r.top>=top-.5&&r.bottom<=bottom+.5&&r.left>=v.offsetLeft-.5&&r.right<=right+.5;
  const b=document.querySelector(box).getBoundingClientRect();
  const bt=buttons.map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return inside(r)&&!!hit&&!!hit.closest(s);});
  return {box:inside(b),buttons:bt.every(Boolean),top:Math.round(b.top),left:Math.round(b.left),h:Math.round(b.height),bottom:Math.round(b.bottom)};
},box,buttons);
const cardFit=()=>fit('#wordBox',['#wbClose','#wbSave']);
const noteFit=()=>fit('#noteBox',['#noteCancel','#noteSave']);
const inView=f=>f.box&&f.buttons;
// The field scrolls: its text is taller than it, and its end can be scrolled to.
const scrolls=sel=>page.$eval(sel,e=>{const r=e.scrollHeight>e.clientHeight+20;e.scrollTop=e.scrollHeight;const end=e.scrollTop>0&&Math.abs(e.scrollTop+e.clientHeight-e.scrollHeight)<2;e.scrollTop=0;return r&&end;});
// Drag a textarea's resize grip (its bottom right corner) down by dy, as a mouse would.
async function dragGrip(sel,dy){
  const g=await page.$eval(sel,e=>{const b=e.getBoundingClientRect();return {x:b.right-4,y:b.bottom-4};});
  await page.mouse.move(g.x,g.y);await page.mouse.down();
  for(let i=1;i<=6;i++) await page.mouse.move(g.x,g.y+dy*i/6);
  await page.mouse.up();
}
const fieldHeight=sel=>page.$eval(sel,e=>e.getBoundingClientRect().height);
// An iPhone keyboard: the page keeps its full height, visualViewport shrinks to `h` and may be panned down by `top`.
const iosKeyboard=(h,top=0)=>page.evaluate((h,top)=>{const v=visualViewport;
  if(h==null){delete v.height;delete v.offsetTop;}
  else{Object.defineProperty(v,'height',{configurable:true,get:()=>h});Object.defineProperty(v,'offsetTop',{configurable:true,get:()=>top});}
  v.dispatchEvent(new Event('resize'));},h,top);
// Drag the word card by its head (from just right of the term), with the mouse or a finger.
async function dragHead(dx,dy,touch){
  const p=await page.$eval('#wbTerm',e=>{const r=e.getBoundingClientRect();return {x:r.right+20,y:r.top+r.height/2};});
  if(touch){await page.touchscreen.touchStart(p.x,p.y);for(let i=1;i<=5;i++) await page.touchscreen.touchMove(p.x+dx*i/5,p.y+dy*i/5);await page.touchscreen.touchEnd();}
  else{await page.mouse.move(p.x,p.y);await page.mouse.down();for(let i=1;i<=5;i++) await page.mouse.move(p.x+dx*i/5,p.y+dy*i/5);await page.mouse.up();}
}
const shot=async label=>{await until(()=>!document.querySelector('#toast').classList.contains('on'));await sleep(200);await page.screenshot({path:join(shots,label+'.png')});};
const resetField=sel=>page.$eval(sel,e=>{e.style.height='';});

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addMarkdown(t,'card-test.md',BOOK,'Card Test');

  for(const [vw,vh,size] of [[390,844,'phone'],[1280,900,'desktop']]){
    await page.setViewport({width:vw,height:vh,deviceScaleFactor:size==='phone'?2:1});await sleep(150);

    // 1. a pasted multi-line meaning, then a long typed one: the card keeps its height, the field scrolls
    await openCard(P1,size==='phone'?'ledger':'harbour',size==='desktop'?250:null);
    const before=await cardFit();
    ok(`${size}: the card opens inside the window, buttons in view`,inView(before));
    await page.focus('#wbDef');await page.keyboard.sendCharacter(PASTED);
    let f=await cardFit();
    ok(`${size}: a pasted meaning keeps its line breaks and tabs while editing`,(await page.$eval('#wbDef',e=>e.value))===PASTED);
    ok(`${size}: after pasting, the card keeps its height and its buttons are in view`,inView(f)&&f.h===before.h);
    await page.keyboard.sendCharacter(LONG);await page.keyboard.type(' The end.');
    f=await cardFit();
    ok(`${size}: after 1,100+ characters, the buttons are in view`,inView(f)&&f.h===before.h);
    ok(`${size}: the long text scrolls inside the field, to its end`,await scrolls('#wbDef'));
    await shot(`${size}-long`);

    // 2. the field dragged far taller by its grip: it grows, the card stops at the window's edge
    const h0=await fieldHeight('#wbDef');
    await dragGrip('#wbDef',1200);
    f=await cardFit();
    ok(`${size}: the grip makes the field taller`,(await fieldHeight('#wbDef'))>h0+100);
    ok(`${size}: dragged taller, the card stays inside the window with its buttons in view`,inView(f));
    ok(`${size}: and the text still scrolls`,await scrolls('#wbDef'));
    ok(`${size}: the field gives way, the sentence below it stays whole`,await page.$eval('#wbEx',e=>e.scrollHeight<=e.clientHeight));
    await shot(`${size}-grip`);
    const h1=await fieldHeight('#wbDef');await dragGrip('#wbDef',-150);
    ok(`${size}: the grip shrinks the field again at once`,Math.abs((await fieldHeight('#wbDef'))-(h1-150))<=4);
    await dragGrip('#wbDef',1200);

    // 3. a keyboard-height window (Android resizes the page), the field focused
    await page.focus('#wbDef');
    await page.setViewport({width:vw,height:400,deviceScaleFactor:size==='phone'?2:1});await sleep(150);
    f=await cardFit();
    ok(`${size}: in a 400 px tall window, the card fits and its buttons are in view`,inView(f)&&f.h<=400);
    ok(`${size}: there, the text still scrolls, and the sentence stays whole`,await scrolls('#wbDef')&&await page.$eval('#wbEx',e=>e.scrollHeight<=e.clientHeight));
    await shot(`${size}-400`);
    await page.setViewport({width:vw,height:vh,deviceScaleFactor:size==='phone'?2:1});await sleep(150);

    // 4. an iPhone keyboard: the visible area shrinks to the top 400 px, then iOS pans it down to the field
    await iosKeyboard(400);await sleep(50);
    f=await cardFit();
    ok(`${size}: above an iPhone keyboard, the card and its buttons are in view`,inView(f)&&f.bottom<=400);
    await iosKeyboard(400,200);await sleep(50);
    f=await cardFit();
    ok(`${size}: with the visible area panned down, they follow it`,inView(f)&&f.top>=200&&f.bottom<=600);
    await iosKeyboard(null);await sleep(50);
    f=await cardFit();
    ok(`${size}: the keyboard closed, the card is back inside the window`,inView(f));

    // 5. Save still works, and the next card opens at its usual size once the field is back to normal
    await page.click('#wbSave');await hidden('#wordBox');
    ok(`${size}: Save saves the long meaning`,(await text('#toast'))==='Meaning saved');
    await resetField('#wbDef');
  }

  // 6. dragging the card by its head (desktop, mouse)
  await page.setViewport({width:1280,height:900,deviceScaleFactor:1});await sleep(150);
  await openCard(P2,'obdurate');
  const home=await cardFit();
  ok('the head shows a grab cursor',await page.$eval('#wordBox .wb-head',e=>getComputedStyle(e).cursor)==='grab');
  await dragHead(-200,-150);
  let f=await cardFit();
  ok('dragging the head moves the card with the pointer',Math.abs(f.left-(home.left-200))<=1&&Math.abs(f.top-(home.top-150))<=1);
  await shot('desktop-dragged');
  await dragHead(-5000,-5000);f=await cardFit();
  ok('dragged past the top left, it stops inside the window',inView(f)&&f.left===10&&f.top===12);
  await dragHead(5000,5000);f=await cardFit();
  ok('dragged past the bottom right, it stops inside the window',inView(f)&&f.bottom===900-12);
  const at=f;
  const ta=await page.$eval('#wbDef',e=>{const r=e.getBoundingClientRect();return {x:r.left+30,y:r.top+20};});
  await page.mouse.move(ta.x,ta.y);await page.mouse.down();await page.mouse.move(ta.x-200,ta.y-200,{steps:5});await page.mouse.up();
  f=await cardFit();
  ok('pressing and moving in the meaning field doesn’t drag the card',f.left===at.left&&f.top===at.top);
  await page.focus('#wbDef');await page.keyboard.type('Stubborn.');
  ok('typing in the meaning after a drag works',(await page.$eval('#wbDef',e=>e.value))==='Stubborn.');
  await iosKeyboard(400);await sleep(50);f=await cardFit();
  ok('a dragged card moves above a keyboard',inView(f)&&f.bottom<=400);
  await iosKeyboard(null);
  await page.click('#wbSave');await hidden('#wordBox');
  ok('after a drag, Save works',(await text('#toast'))==='Meaning saved');
  await openCard(P2,'obdurate');f=await cardFit();
  ok('the card reopens where it opened before the drag',f.left===home.left&&f.top===home.top);
  await page.keyboard.press('Escape');await hidden('#wordBox');
  ok('Escape closes it',!(await vis('#wordBox')));

  // 7. on a phone, with a finger: the docked card leaves its dock and stays inside
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,hasTouch:true});await sleep(150);
  await openCard(P1,'lanterns');
  const dock=await cardFit();
  ok('phones show a grip on the head',await page.$eval('#wordBox .wb-head',e=>getComputedStyle(e,'::before').content)==='""');
  await dragHead(0,-300,true);f=await cardFit();
  ok('a finger drags the card up from its dock',Math.abs(f.top-(dock.top-300))<=1&&inView(f));
  await shot('phone-dragged');
  await dragHead(0,-2000,true);f=await cardFit();
  ok('and it stops at the top of the screen',inView(f)&&f.top===12);
  await page.click('#wbClose');await hidden('#wordBox');
  ok('after a drag, Close works',!(await vis('#wordBox')));
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});await sleep(150);

  // 8. the note box: the same, on a phone and on a desktop
  for(const [vw,vh,size] of [[390,844,'phone'],[1280,900,'desktop']]){
    await page.setViewport({width:vw,height:vh,deviceScaleFactor:size==='phone'?2:1});await sleep(150);
    await select(P2,size==='phone'?'gulls':'rocks',size==='desktop'?600:null);
    await page.click('#tool [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
    await page.focus('#noteTa');await page.keyboard.sendCharacter(PASTED+LONG);
    f=await noteFit();
    ok(`${size}: a long note keeps the note box’s buttons in view, and scrolls`,inView(f)&&await scrolls('#noteTa'));
    await dragGrip('#noteTa',1200);f=await noteFit();
    ok(`${size}: the note field dragged taller, the box stays inside the window`,inView(f));
    await shot(`${size}-note-grip`);
    await iosKeyboard(400);await sleep(50);f=await noteFit();
    ok(`${size}: above an iPhone keyboard, the note box’s buttons are in view`,inView(f)&&f.bottom<=400);
    await shot(`${size}-note-keyboard`);
    await iosKeyboard(null);
    await page.click('#noteSave');await hidden('#noteBox');
    ok(`${size}: Save note works`,(await text('#toast'))==='Note saved');
    await resetField('#noteTa');
  }
});
