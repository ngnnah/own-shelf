// Arrange by Shelf: category shelves (one per book, kept in its reading state), dragging covers between them with a
// mouse and with a finger, the Shelf picker in Book details, new (at the top), rename, move and delete, search, the List
// view and backups; collapsing and expanding shelves (one, Collapse all / Expand all, kept per device across a reload,
// a cover dropped on a collapsed shelf, a new shelf open, search opening them); dragging a shelf by its name to reorder
// (mouse and touch, the line where it lands, one write per drop, Escape, a tap still opening its dialog, Unsorted fixed).
// Usage: node tests/browser/shelves.mjs [repo dir]. Screenshots: tests/browser/out/shelves/ (390 and 1280 px, light and dark).
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {start,sleep,enterLocalMode,addMarkdown,waitForFile} from './lib.mjs';

const t=await start('shelves',8155);
const {page,must,vis,text,until}=t;
let seen=''; // the shelves last read off the screen, printed when a check fails
const ok=(label,cond)=>{t.ok(label,cond);if(!cond&&seen)console.log('  shelves on screen:',seen);};
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','shelves');mkdirSync(shots,{recursive:true});
const md=title=>`# ${title}\n\n`+'Plain words for a plain test book on the shelf. '.repeat(10);
const KINDLE='The Lighthouse Ledger (Harbour Tales Book 2)';
const home=async()=>{await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');};
// Before a reload, let the writes land: IndexedDB runs a store's readwrite transactions in order, so once a new one
// completes every earlier write has (a moved book's state is written a moment after its shelf entry).
const settle=p=>p.evaluate(()=>new Promise(res=>{const r=indexedDB.open('upwind',1);r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite');tx.objectStore('kv').get('-');tx.oncomplete=()=>{r.result.close();res();};};}));
const reload=async(p=page)=>{await sleep(150);await settle(p);await p.reload({waitUntil:'networkidle0'});await p.waitForSelector('#shelf:not(.hidden)');};
const prefs=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:prefs')||'{}'));
// one stored value (local mode keeps every key in IndexedDB), and a book's id from its cover
const idb=(key,p=page)=>p.evaluate(k=>new Promise(res=>{const r=indexedDB.open('upwind',1);r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get(k);g.onsuccess=()=>{r.result.close();res(g.result);};};}),key);
const idOf=title=>page.$eval(cov(title),c=>c.dataset.open);
const outside=()=>page.mouse.click(4,4); // on a dialog's backdrop
// every shelf row on screen: its id, name and the titles on it
const rows=(p=page)=>p.$$eval('#shelfBody .shelf-row',rs=>rs.map(r=>({id:r.dataset.shelf,name:r.querySelector('.shelf-label :is(.sl-name,span)').textContent.trim(),
  books:[...r.querySelectorAll('.c-t')].map(x=>x.textContent),hint:!!r.querySelector('.sl-hint')})));
const names=async(p=page)=>seen=(await rows(p)).map(r=>r.name).join('|');
const on=async(name,p=page)=>((await rows(p)).find(r=>r.name===name)||{books:[]}).books;
const cov=title=>`.cover[aria-label^="${title.replace(/"/g,'\\"')}"]`;
const rowSel=id=>`#shelfBody .shelf-row[data-shelf="${id}"]`;
// a point inside an element, scrolled into view first when asked
const spot=(sel,scroll=true)=>page.$eval(sel,(e,scroll)=>{if(scroll)e.scrollIntoView({block:'center',inline:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+Math.min(r.height/2,40)};},scroll);
const toastHas=s=>until(s=>document.querySelector('#toast').classList.contains('on')&&document.querySelector('#toast').textContent.includes(s),s);
const lit=()=>page.$$eval('#shelfBody .shelf-row.drop',rs=>rs.map(r=>r.dataset.shelf));
const ghost=()=>page.$('.drag-ghost').then(Boolean);
const shelfNow=()=>vis('#shelf');
const scheme=s=>page.emulateMediaFeatures([{name:'prefers-color-scheme',value:s}]);
const shoot=async(label,opts={fullPage:true})=>{for(const s of ['light','dark']){await scheme(s);await page.screenshot({path:join(shots,`${label}-${s}.png`),...opts});}await scheme('light');};
const PHONE={width:390,height:844,deviceScaleFactor:2},TALL={width:390,height:2600,deviceScaleFactor:1},DESK={width:1280,height:900,deviceScaleFactor:1},DESK_TALL={...DESK,height:1700};

// Mouse: press on the cover, move past the threshold, then to the target row, and let go there.
async function mouseDrag(title,id,{drop=true}={}){
  const a=await spot(cov(title));
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+12,a.y+12,{steps:3});
  const b=await spot(rowSel(id),false);await page.mouse.move(b.x,b.y,{steps:8});
  const r={lifted:await ghost(),lit:await lit()};
  if(drop) await page.mouse.up();
  return r;
}
// Shelves dragged by their names, and collapsed or expanded by their arrows
const fold=id=>`#shelfBody [data-fold="${id}"]`;
const nameSel=id=>`#shelfBody [data-shelf-edit="${id}"]`;
// counts the page's writes to its store from here on, by key ({} when none)
const spy=(p=page)=>p.evaluate(()=>{window.__puts={};const P=IDBObjectStore.prototype;if(P.__spied) return;P.__spied=1;
  const put=P.put;P.put=function(v,k){window.__puts[k]=(window.__puts[k]||0)+1;return put.apply(this,arguments);};});
const puts=()=>page.evaluate(()=>window.__puts);
// the line showing where a dragged shelf would land: its middle's y, or null when none shows
const mark=()=>page.evaluate(()=>{const m=document.querySelector('.shelf-mark');return m&&!m.classList.contains('hidden')?m.getBoundingClientRect().top+2:null;});
// Mouse: press on a shelf's name, move past the threshold, then into the target row (frac of its height from the top;
// last: just below the last row), and let go there.
async function mouseShelf(id,toId,{frac=.25,drop=true,last=false}={}){
  const a=await spot(nameSel(id));
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+12,a.y+12,{steps:3});
  const b=await page.evaluate((sel,f,last)=>{const rs=document.querySelectorAll('#shelfBody .shelf-row'),r=(last?rs[rs.length-1]:document.querySelector(sel)).getBoundingClientRect();
    return {x:r.left+40,y:last?r.bottom+12:r.top+r.height*f};},rowSel(toId),frac,last);
  await page.mouse.move(b.x,b.y,{steps:8});
  const r={lifted:!!(await page.$('.shelf-label.drag-ghost')),faded:!!(await page.$(rowSel(id)+'.lifted')),mark:await mark()};
  if(drop) await page.mouse.up();
  return r;
}
// Touch: hold a shelf's name ~0.55 s, then move the finger into the target row in steps, and lift it.
async function touchShelf(id,toId,frac=.25){
  const a=await spot(nameSel(id));
  await page.evaluate(()=>{window.__tm={n:0,prevented:0};});
  await page.touchscreen.touchStart(a.x,a.y);await sleep(550);
  const lifted=!!(await page.$('.shelf-label.drag-ghost')),b=await page.$eval(rowSel(toId),(e,f)=>{const r=e.getBoundingClientRect();return {x:r.left+40,y:r.top+r.height*f};},frac);
  for(let i=1;i<=8;i++) await page.touchscreen.touchMove(a.x+(b.x-a.x)*i/8,a.y+(b.y-a.y)*i/8);
  const r={lifted,mark:await mark()};await page.touchscreen.touchEnd();
  r.tm=await page.evaluate(()=>window.__tm);return r;
}
// Touch: hold the cover ~0.55 s, then move the finger to the target row in steps, and lift it.
async function touchDrag(title,id){
  const a=await spot(cov(title));
  await page.evaluate(()=>{window.__tm={n:0,prevented:0};});
  await page.touchscreen.touchStart(a.x,a.y);await sleep(550);
  const lifted=await ghost(),b=await spot(rowSel(id),false);
  for(let i=1;i<=8;i++) await page.touchscreen.touchMove(a.x+(b.x-a.x)*i/8,a.y+(b.y-a.y)*i/8);
  const r={lifted,lit:await lit()};await page.touchscreen.touchEnd();
  r.tm=await page.evaluate(()=>window.__tm);return r;
}

await t.run(async()=>{
  // an existing user, who arranged by title before shelves existed
  await page.goto(t.base,{waitUntil:'networkidle0'});
  await page.evaluate(()=>localStorage.setItem('upwind:prefs',JSON.stringify({group:'title',view:'shelves'})));
  await enterLocalMode(t,must);
  for(const title of ['Atlas of Winds','A Ledger of Kings','Salt and Sails']){await addMarkdown(t,title.replace(/\W/g,'')+'.md',md(title),title);await home();}
  const k=join(t.tmp,'k.html');writeFileSync(k,readFileSync(join(t.repo,'tests/fixtures/kindle-notebook.html'),'utf8'));
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');await (await page.$('#file')).uploadFile(k);
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));await page.click('#impGo');await t.reader();await home();

  // Arrange by: Shelf comes first, and is chosen once for everyone
  ok('Arrange by starts with Shelf',(await page.$$eval('#segGroup button',bs=>bs.map(b=>b.textContent).join('|')))==='Shelf|Date added|Date written|Author|Title');
  ok('an existing user is switched to Shelf once',(await page.$eval('#segGroup [data-g="shelf"]',b=>b.getAttribute('aria-pressed')))==='true'&&(await prefs()).group==='shelf');
  ok('Unsorted comes first while it holds books, then the six starting shelves',(await names())==='Unsorted|Travel|Adventure|History|Finance|Fantasy|Philosophy');
  ok('every book starts Unsorted, Kindle notebooks too, newest added first',(await on('Unsorted')).join('|')===`${KINDLE}|Salt and Sails|A Ledger of Kings|Atlas of Winds`);
  ok('empty shelves show with a hint to drag books there',(await rows()).filter(r=>r.hint).length===6&&(await text(rowSel('travel'))).includes('Drag books here'));
  ok('no sideways scroll on a phone',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const lay=await page.evaluate(()=>{const rs=[...document.querySelectorAll('#shelfBody .shelf-row')],r=e=>e.getBoundingClientRect();
    return {bare:rs.filter(x=>x.classList.contains('bare')).map(x=>Math.round(r(x).height)),span:Math.round(r(rs.at(-1)).bottom-r(rs[0]).top)};});
  ok('an empty shelf is compact: its name and a slim strip (about 56 px)',lay.bare.length===6&&lay.bare.every(h=>h>=44&&h<=60));
  ok('Unsorted and the six empty shelves fit on one phone screen',lay.span<=844);
  await page.evaluate(()=>document.querySelector('#shelfBody').scrollIntoView());
  await shoot('start-390',{});
  await shoot('start-390-full');
  await page.click('#segGroup [data-g="added"]');await reload();
  ok('after that, another choice is remembered',(await prefs()).group==='added'&&!(await page.$('#shelfBody .sl-name')));
  await page.click('#segGroup [data-g="shelf"]');
  ok('choosing Shelf again shows the shelves',(await names()).startsWith('Unsorted|Travel|'));

  // drag with a mouse (a tall window, so every shelf is on screen)
  await page.setViewport(TALL);
  const m1=await mouseDrag('Atlas of Winds','history');
  ok('mouse: the book lifts and the shelf under the pointer lights up',m1.lifted&&m1.lit.join()==='history');
  ok('mouse: dropping moves the book, with a toast',await toastHas('Moved to History')&&(await on('History')).join()==='Atlas of Winds'&&!(await on('Unsorted')).includes('Atlas of Winds'));
  ok('mouse: the drag leaves no ghost and opens nothing',!(await ghost())&&await shelfNow()&&!(await lit()).length);
  await reload();
  ok('the move is kept after a reload',(await on('History')).join()==='Atlas of Winds');
  const atlas=await idOf('Atlas of Winds');
  ok('a move is kept in the book\'s reading state, not its doc',(await idb('state:'+atlas)).shelf==='history'&&(await idb('meta:'+atlas)).shelf==='history'&&!('shelf' in (await idb('doc:'+atlas))));
  // reading the book saves its state and shelf entry again: the shelf stays
  await page.click(cov('Atlas of Winds'));await t.reader();await page.evaluate(()=>scrollTo(0,200));await sleep(800);await home();
  ok('reading the book keeps its shelf',(await on('History')).join()==='Atlas of Winds'&&(await idb('state:'+atlas)).shelf==='history');
  // a plain click still opens the book
  await page.click(cov('Salt and Sails'));await t.reader();
  ok('mouse: a click on a cover still opens the book',(await page.title()).startsWith('Salt and Sails'));
  await home();
  // dropping outside any shelf, or on its own shelf, moves nothing; Escape cancels
  {
    const a=await spot(cov('A Ledger of Kings'));
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+12,a.y+12,{steps:3});
    await page.mouse.move(a.x+20,a.y+40,{steps:3});
    ok('mouse: its own shelf doesn\'t light up',await ghost()&&!(await lit()).length);
    await page.keyboard.press('Escape');
    ok('Escape drops the book back',!(await ghost()));
    await page.mouse.up();
    ok('… where it was, and opens nothing',(await on('Unsorted')).includes('A Ledger of Kings')&&await shelfNow());
  }

  // touch: hold, then drag; a quick swipe scrolls; a tap opens
  await page.setViewport({...TALL,isMobile:true,hasTouch:true});await reload();
  await page.evaluate(()=>window.addEventListener('touchmove',e=>{window.__tm.n++;if(e.defaultPrevented)window.__tm.prevented++;},{passive:true}));
  const t1=await touchDrag('Salt and Sails','travel');
  ok('touch: holding a cover lifts the book',t1.lifted);
  ok('touch: the shelf under the finger lights up',t1.lit.join()==='travel');
  ok('touch: the page doesn\'t scroll while dragging',t1.tm.n>0&&t1.tm.prevented===t1.tm.n);
  ok('touch: lifting the finger moves the book',await toastHas('Moved to Travel')&&(await on('Travel')).join()==='Salt and Sails'&&await shelfNow());
  await reload();
  ok('touch: the move is kept after a reload',(await on('Travel')).join()==='Salt and Sails');
  await page.evaluate(()=>window.addEventListener('touchmove',e=>{window.__tm.n++;if(e.defaultPrevented)window.__tm.prevented++;},{passive:true}));
  {
    // a quick sideways swipe across the Unsorted row: no drag, the browser may scroll
    const a=await spot(cov(KINDLE));await page.evaluate(()=>{window.__tm={n:0,prevented:0};});
    await page.touchscreen.touchStart(a.x,a.y);
    for(let i=1;i<=6;i++){await page.touchscreen.touchMove(a.x-25*i,a.y+2*i);await sleep(15);}
    const g=await ghost();await page.touchscreen.touchEnd();await sleep(500);
    const tm=await page.evaluate(()=>window.__tm);
    ok('touch: a quick swipe doesn\'t lift the book',!g&&!(await ghost()));
    ok('touch: … and isn\'t blocked from scrolling',tm.n>0&&tm.prevented===0);
    ok('touch: … moves nothing and opens nothing',(await on('Unsorted')).join('|')===`${KINDLE}|A Ledger of Kings`&&await shelfNow());
    // a short hold that moves before ~400 ms is a scroll too
    await page.touchscreen.touchStart(a.x,a.y);await sleep(200);await page.touchscreen.touchMove(a.x,a.y-60);await sleep(400);
    ok('touch: moving during the hold cancels the drag',!(await ghost()));
    await page.touchscreen.touchEnd();
  }
  await page.touchscreen.tap(...Object.values(await spot(cov('A Ledger of Kings'))));await t.reader();
  ok('touch: a tap still opens the book',(await page.title()).startsWith('A Ledger of Kings'));
  await home();
  // Chrome drops -webkit-touch-callout (iOS only), so the stylesheet is read for it
  ok('covers have no long-press callout or text selection',/\n\.cover\{[^}]*-webkit-touch-callout:none/.test(readFileSync(join(t.repo,'styles.css'),'utf8'))&&await page.$eval('.cover',c=>getComputedStyle(c).userSelect==='none'));

  // near the bottom edge the page scrolls while dragging (a phone-sized window)
  await page.setViewport(PHONE);await reload();
  {
    await page.evaluate(()=>scrollTo(0,0));
    const a=await spot(cov(KINDLE),false);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+12,a.y+12,{steps:3});
    const y0=await page.evaluate(()=>scrollY);await page.mouse.move(a.x,836,{steps:4});await sleep(600);
    const y1=await page.evaluate(()=>scrollY);
    ok('dragging near the bottom edge scrolls the page down',y1>y0+150);
    await page.mouse.move(a.x,6,{steps:4});await sleep(500);
    ok('… and near the top edge, up',(await page.evaluate(()=>scrollY))<y1-150);
    await page.keyboard.press('Escape');await page.mouse.up();
    ok('… and Escape ends that drag too',!(await ghost())&&!(await page.$('.book.lifted')));
  }

  // Book details: the Shelf picker
  const details=async title=>{await page.$$eval('.book',(bs,tt)=>bs.find(b=>b.querySelector('.c-t').textContent===tt).querySelector('.c-more').click(),title);await page.waitForSelector('#detM:not(.hidden)');};
  await details('Atlas of Winds');
  ok('Details has a Shelf picker with every shelf and Unsorted, on the book\'s shelf',(await page.$$eval('#dShelf option',os=>os.map(o=>o.textContent).join('|')))==='Travel|Adventure|History|Finance|Fantasy|Philosophy|Unsorted'&&(await page.$eval('#dShelf',s=>s.selectedOptions[0].textContent))==='History');
  await shoot('details-390',{});
  await page.click('#detM [data-cancel]');
  await details('A Ledger of Kings');
  ok('an unsorted book shows Unsorted',(await page.$eval('#dShelf',s=>s.value))==='');
  await page.select('#dShelf','finance');await page.click('#dSave');await until(()=>document.querySelector('#detM').classList.contains('hidden'));
  ok('saving Details moves the book',(await on('Finance')).join()==='A Ledger of Kings');
  const ledger=await idOf('A Ledger of Kings');
  ok('… into its reading state, not its doc',(await idb('state:'+ledger)).shelf==='finance'&&!('shelf' in (await idb('doc:'+ledger))));
  await reload();
  ok('… and it stays after a reload',(await on('Finance')).join()==='A Ledger of Kings');
  // Mark as finished rewrites the state: the shelf stays
  await details('A Ledger of Kings');await page.click('#dFinish');await toastHas('Marked as finished');await page.click('#detM [data-cancel]');
  ok('Mark as finished keeps the shelf',(await on('Finance')).join()==='A Ledger of Kings'&&(await idb('state:'+ledger)).finished&&(await idb('state:'+ledger)).shelf==='finance');
  // while reading: the heading's pencil opens Details; only the shelf changes, and a tap outside saves it
  await page.click(cov(KINDLE));await t.reader();await page.click('.hero .ed');await page.waitForSelector('#detM:not(.hidden)');
  await page.select('#dShelf','philosophy');await outside();await until(()=>document.querySelector('#detM').classList.contains('hidden'));
  await sleep(700);await home(); // the open book's state is saved a moment later, and again on the way out
  const kid=await idOf(KINDLE);
  ok('Details while reading: a tap outside saves a new shelf',(await on('Philosophy')).join()===KINDLE&&(await idb('state:'+kid)).shelf==='philosophy');
  ok('with every book placed, Unsorted hides',!(await names()).includes('Unsorted'));
  // a newer Kindle export merges into the book: the shelf stays
  const newer=readFileSync(join(t.repo,'tests/fixtures/kindle-notebook.html'),'utf8').replace('Part Two\n</div>','Part Two\n</div><div class="noteHeading">Highlight(<span class="annotation_yellow">yellow</span>) - Storms > Page 19 · Location 290</div><div class="noteText">A brand new line from the second read.</div>');
  const k2=join(t.tmp,'k2.html');writeFileSync(k2,newer);
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');await (await page.$('#file')).uploadFile(k2);
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));await page.click('#impGo');
  ok('a newer Kindle export merges',await toastHas('Merged: 1 new highlight'));
  await t.reader();await home();
  ok('… and the book keeps its shelf',(await on('Philosophy')).join()===KINDLE&&(await idb('state:'+kid)).shelf==='philosophy');
  // removed, then Undo: back on its shelf
  await details('Salt and Sails');await page.click('#dRemove');await page.click('#dRemove');
  await toastHas('Moved to Trash');
  ok('a removed book leaves its shelf',!(await on('Travel')).length);
  await page.click('#toast button');await toastHas('Restored');
  ok('Undo puts it back on its shelf',(await on('Travel')).join()==='Salt and Sails');

  // managing shelves: new, rename, move up and down, delete
  ok('Unsorted isn\'t a button; named shelves are',(await page.$$('#shelfBody .sl-name')).length===6);
  ok('+ New shelf is at the top, by Arrange by, not after the last shelf',await vis('#shTools [data-shelf-new]')&&!(await page.$('#shelfBody [data-shelf-new]'))
    &&await page.evaluate(()=>{const r=e=>document.querySelector(e).getBoundingClientRect();return r('#shTools').top>=r('#segGroup').top&&r('#shTools').bottom<=r('#shelfBody').top;}));
  await page.click('#shTools [data-shelf-new]');await page.waitForSelector('#shelfM:not(.hidden)');
  ok('+ New shelf asks for a name',(await text('#shH'))==='New shelf'&&!(await vis('#shDel'))&&!(await vis('#shMove')));
  await outside();
  ok('a tap outside with nothing typed just closes',await until(()=>document.querySelector('#shelfM').classList.contains('hidden'))&&(await names())==='Travel|Adventure|History|Finance|Fantasy|Philosophy');
  await page.click('#shTools [data-shelf-new]');await page.waitForSelector('#shelfM:not(.hidden)');
  await page.type('#shName','Poetry');await outside();await until(()=>document.querySelector('#shelfM').classList.contains('hidden'));
  ok('a tap outside with a name typed adds the shelf, at the end, empty with its hint',(await names())==='Travel|Adventure|History|Finance|Fantasy|Philosophy|Poetry'&&(await rows()).find(r=>r.name==='Poetry').hint);
  await page.click('#shTools [data-shelf-new]');await page.waitForSelector('#shelfM:not(.hidden)');
  await page.type('#shName','history');await page.click('#shSave');
  ok('a name already taken is refused',await vis('#shErr')&&(await text('#shErr')).includes('already')&&await vis('#shelfM'));
  await page.click('#shelfM [data-cancel]');
  const edit=async id=>{await page.click(`#shelfBody [data-shelf-edit="${id}"]`);await page.waitForSelector('#shelfM:not(.hidden)');};
  await edit('history');
  ok('tapping a shelf\'s name opens it',(await page.$eval('#shName',i=>i.value))==='History'&&await vis('#shDel')&&await vis('#shMove'));
  await page.$eval('#shName',i=>{i.value='';});await page.type('#shName','Old Times');await page.keyboard.press('Enter');
  await until(()=>document.querySelector('#shelfM').classList.contains('hidden'));
  ok('rename: the shelf keeps its place and its books',(await names()).startsWith('Travel|Adventure|Old Times|')&&(await on('Old Times')).join()==='Atlas of Winds');
  await edit((await rows()).find(r=>r.name==='Poetry').id);
  ok('the last shelf can\'t move down',await page.$eval('#shDown',b=>b.disabled)&&!(await page.$eval('#shUp',b=>b.disabled)));
  await page.click('#shUp');await page.click('#shUp');
  ok('Move up, twice',(await names())==='Travel|Adventure|Old Times|Finance|Poetry|Fantasy|Philosophy');
  await page.click('#shDown');
  ok('Move down',(await names())==='Travel|Adventure|Old Times|Finance|Fantasy|Poetry|Philosophy');
  await shoot('shelf-dialog-390',{});
  await page.click('#shelfM [data-cancel]');
  await edit('travel');
  ok('the first shelf can\'t move up',await page.$eval('#shUp',b=>b.disabled));
  await page.click('#shelfM [data-cancel]');
  await edit('history');
  await page.click('#shDel');
  ok('Delete asks for a second tap, no typing',(await text('#shDel'))==='Tap again to delete'&&await vis('#shelfM')&&!(await vis('#confirmM')));
  await page.click('#shDel');await until(()=>document.querySelector('#shelfM').classList.contains('hidden'));
  ok('delete: the shelf goes, its books go to Unsorted (first again)',!(await names()).includes('Old Times')&&(await names()).startsWith('Unsorted|')&&(await on('Unsorted')).join()==='Atlas of Winds');
  ok('delete: the toast says where the books went',await toastHas('in Unsorted'));
  await reload();
  ok('shelf changes are kept after a reload',(await names())==='Unsorted|Travel|Adventure|Finance|Fantasy|Poetry|Philosophy');
  ok('the Details picker follows the shelves',(await (async()=>{await details('Atlas of Winds');const o=await page.$$eval('#dShelf option',os=>os.map(o=>o.textContent).join('|'));await page.click('#detM [data-cancel]');return o;})())==='Travel|Adventure|Finance|Fantasy|Poetry|Philosophy|Unsorted');

  // search filters across shelves; empty shelves hide while searching
  await page.type('#q','ledger');
  ok('search: only shelves with a match show, without New shelf or Collapse all',(await names())==='Finance|Philosophy'&&!(await vis('#shTools')));
  await page.$eval('#q',i=>{i.value='';i.dispatchEvent(new Event('input'));});
  ok('clearing the search shows every shelf again',(await names())==='Unsorted|Travel|Adventure|Finance|Fantasy|Poetry|Philosophy');

  // List view: arranged by shelf, it sorts by a Shelf column in shelf order, Unsorted last
  await page.click('#segView [data-v="list"]');await page.waitForSelector('.tbl');
  await page.click('#segGroup [data-g="added"]');await page.click('#segGroup [data-g="shelf"]');
  const list=()=>page.$$eval('.tbl tbody tr',rs=>rs.map(r=>r.querySelector('.tt').textContent+'/'+r.querySelector('.c-shelf').textContent).join('|'));
  ok('List view: a Shelf column, sorted in shelf order, Unsorted last',(await list())===`Salt and Sails/Travel|A Ledger of Kings/Finance|${KINDLE}/Philosophy|Atlas of Winds/Unsorted`&&(await page.$eval('.tbl [data-sort="shelf"]',b=>b.getAttribute('aria-sort')))==='ascending');
  ok('no sideways scroll in the list at 390 px',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await shoot('list-390');
  await page.setViewport(DESK);
  await shoot('list-1280');
  await page.click('#segView [data-v="shelves"]');
  await page.evaluate(()=>scrollTo(0,0));
  await shoot('shelves-1280');
  // mid-drag picture: the book over Fantasy (a tall window, so the shelf isn't in the edge's scrolling band)
  await page.setViewport(DESK_TALL);
  await mouseDrag('Atlas of Winds','fantasy',{drop:false});await sleep(300); // the highlight fades in
  await shoot('drag-1280',{});
  await page.mouse.up();
  ok('a drag at desktop size moves the book too',await toastHas('Moved to Fantasy')&&(await on('Fantasy')).join()==='Atlas of Winds');
  await page.setViewport(PHONE);

  // backup and restore keep the shelves
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');await page.click('#backupBtn');
  const bk=await waitForFile(t.dl,/^own-shelf-backup-.*\.json$/);const data=bk&&JSON.parse(readFileSync(join(t.dl,bk),'utf8'));
  ok('the backup carries the shelf list and each book\'s shelf',data&&data.version===1&&data.shelves.map(s=>s.name).join('|')==='Travel|Adventure|Finance|Fantasy|Poetry|Philosophy'
    &&data.books.find(b=>b.doc.title==='Salt and Sails').state.shelf==='travel'&&data.books.find(b=>b.doc.title==='Atlas of Winds').state.shelf==='fantasy'&&data.books.every(b=>!('shelf' in b.doc)));
  await page.click('#setM [data-cancel]');
  // a fresh shelf in another origin (its own storage) restores it
  const p2=await t.newPage();
  await p2.goto(`http://127.0.0.1:${t.port}/`,{waitUntil:'networkidle0'});await p2.waitForSelector('#signin:not(.hidden)',{timeout:15000});
  await p2.click('#siLocal');await p2.waitForSelector('#shelf:not(.hidden)');
  await p2.click('#setBtn');await p2.waitForSelector('#setM:not(.hidden)');
  await (await p2.$('#restoreFile')).uploadFile(join(t.dl,bk));
  await p2.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Restored'),{timeout:5000}).catch(()=>{});
  ok('restore: the shelves come back in order, with their books',(await names(p2))==='Travel|Adventure|Finance|Fantasy|Poetry|Philosophy'&&(await on('Fantasy',p2)).join()==='Atlas of Winds'&&(await on('Travel',p2)).join()==='Salt and Sails');
  await reload(p2);
  ok('restore: … and stay after a reload',(await names(p2))==='Travel|Adventure|Finance|Fantasy|Poetry|Philosophy');
  await p2.close();

  // collapse and expand: this device's choice, kept in its prefs; nothing goes to the shelf's storage
  await page.setViewport(PHONE);await reload();await spy();
  // each shelf on screen, - when collapsed, + when open
  const folds=()=>page.$$eval('#shelfBody .shelf-row',rs=>rs.map(r=>(r.classList.contains('shut')?'-':'+')+r.querySelector('.shelf-label :is(.sl-name,span)').textContent).join(' '));
  const poetry=(await rows()).find(r=>r.name==='Poetry').id;
  ok('every shelf\'s heading has a ▾ before its name',(await page.$$eval('#shelfBody .shelf-row',rs=>rs.every(r=>r.querySelector('.shelf-label').firstElementChild.matches('.sl-fold')&&r.querySelector('.sl-fold').textContent==='▾'))));
  await page.click(fold('travel'));
  const strip=await page.$eval(rowSel('travel'),r=>({h:Math.round(r.getBoundingClientRect().height),covers:r.querySelectorAll('.cover').length,count:r.querySelector('small').textContent,arrow:r.querySelector('.sl-fold').textContent,label:r.querySelector('.sl-fold').getAttribute('aria-label')}));
  ok('▾ collapses a shelf to a slim strip: its name, its count and the board',strip.covers===0&&strip.count==='1'&&strip.arrow==='▸'&&strip.label==='Expand Travel'&&strip.h<=44&&(await names()).startsWith('Travel|'));
  ok('… and only that shelf',(await folds())==='-Travel +Adventure +Finance +Fantasy +Poetry +Philosophy');
  await page.click(fold('travel'));
  ok('▸ expands it again',(await folds()).startsWith('+Travel')&&(await on('Travel')).join()==='Salt and Sails');
  await page.focus(fold('fantasy'));await page.keyboard.press('Enter');
  ok('from the keyboard too, and the focus stays on the arrow',(await folds()).includes('-Fantasy')&&await page.evaluate(()=>document.activeElement.dataset.fold==='fantasy'));
  ok('collapsing writes nothing to the shelf\'s storage',!Object.keys(await puts()).length);
  await reload();await spy();
  ok('a collapsed shelf stays collapsed after a reload (this device\'s prefs)',(await folds()).includes('-Fantasy')&&(await prefs()).shut.join()==='fantasy');
  // an unsorted book (from Fantasy, opened first), so Unsorted shows
  await page.click(fold('fantasy'));
  await details('Atlas of Winds');await page.select('#dShelf','');await page.click('#dSave');await until(()=>document.querySelector('#detM').classList.contains('hidden'));
  ok('Collapse all sits by New shelf',await vis('#foldAll')&&(await text('#foldAll'))==='Collapse all');
  await spy();await page.click('#foldAll');
  ok('Collapse all collapses every shelf, Unsorted too',(await folds())==='-Unsorted -Travel -Adventure -Finance -Fantasy -Poetry -Philosophy');
  const all=await page.evaluate(()=>{const rs=[...document.querySelectorAll('#shelfBody .shelf-row')],r=e=>e.getBoundingClientRect();return {hs:rs.map(x=>Math.round(r(x).height)),span:Math.round(r(rs.at(-1)).bottom-r(rs[0]).top)};});
  ok('… into slim strips (about 40 px) that fit well within one phone screen',all.hs.every(h=>h<=44)&&all.span<=480);
  ok('… and the button turns into Expand all',(await text('#foldAll'))==='Expand all');
  ok('Collapse all writes nothing to the shelf\'s storage',!Object.keys(await puts()).length);
  await reload();await spy();
  ok('all collapsed after a reload, with Expand all',(await folds())==='-Unsorted -Travel -Adventure -Finance -Fantasy -Poetry -Philosophy'&&(await text('#foldAll'))==='Expand all');
  await page.evaluate(()=>document.querySelector('#ctrl').scrollIntoView());
  await shoot('collapsed-390',{});

  // a cover dropped on a collapsed shelf: the strip lights up like a full shelf, and stays collapsed
  await page.click(fold(''));
  ok('one shelf expanded among collapsed ones shows its books',(await on('Unsorted')).join()==='Atlas of Winds'&&(await text('#foldAll'))==='Collapse all');
  const m2=await mouseDrag('Atlas of Winds','adventure',{drop:false});await sleep(300); // the highlight fades in
  const glow=await page.$eval(rowSel('adventure'),r=>getComputedStyle(r).outlineColor);
  await page.mouse.up();
  ok('mouse: a collapsed shelf lights up under the pointer',m2.lifted&&m2.lit.join()==='adventure'&&glow!=='rgba(0, 0, 0, 0)');
  ok('mouse: dropping on it moves the book there; it stays collapsed, with its count',await toastHas('Moved to Adventure')&&(await idb('meta:'+atlas)).shelf==='adventure'
    &&await page.$eval(rowSel('adventure'),r=>r.classList.contains('shut')&&r.querySelector('small').textContent==='1')&&!(await names()).includes('Unsorted'));
  await page.setViewport({...PHONE,isMobile:true,hasTouch:true});await reload();
  await page.evaluate(()=>window.addEventListener('touchmove',e=>{window.__tm.n++;if(e.defaultPrevented)window.__tm.prevented++;},{passive:true}));
  await page.click(fold('travel'));
  const salt=await idOf('Salt and Sails'),t2=await touchDrag('Salt and Sails','finance');
  ok('touch: a collapsed shelf lights up under the finger',t2.lifted&&t2.lit.join()==='finance'&&t2.tm.prevented===t2.tm.n);
  ok('touch: lifting the finger moves the book there; it stays collapsed',await toastHas('Moved to Finance')&&(await idb('meta:'+salt)).shelf==='finance'
    &&await page.$eval(rowSel('finance'),r=>r.classList.contains('shut')&&r.querySelector('small').textContent==='2')&&!(await on('Travel')).length);

  // a new shelf starts expanded; Expand all opens the rest
  await page.click(fold('travel'));
  ok('every shelf collapsed again',(await text('#foldAll'))==='Expand all');
  await spy();
  await page.click('#shTools [data-shelf-new]');await page.waitForSelector('#shelfM:not(.hidden)');await page.type('#shName','Maps');await page.click('#shSave');
  await until(()=>document.querySelector('#shelfM').classList.contains('hidden'));
  const maps=(await rows()).find(r=>r.name==='Maps');
  ok('a new shelf starts expanded among collapsed ones (one write: the shelf list)',maps&&maps.hint&&(await folds()).endsWith('+Maps')&&(await puts())['settings:app']===1&&(await text('#foldAll'))==='Collapse all');
  await page.click('#foldAll');
  await page.click('#foldAll');
  ok('Collapse all, then Expand all, opens every shelf',(await folds())==='+Travel +Adventure +Finance +Fantasy +Poetry +Philosophy +Maps'&&!(await prefs()).shut.length&&(await text('#foldAll'))==='Collapse all');

  // search opens a collapsed shelf with a match, and leaves it collapsed afterwards
  await page.click('#foldAll');
  await page.type('#q','salt');
  ok('search: a collapsed shelf with a match shows open, without the arrows',(await names())==='Finance'&&(await on('Finance')).join()==='Salt and Sails'&&!(await page.$('#shelfBody .sl-fold'))&&!(await vis('#shTools')));
  await page.$eval('#q',i=>{i.value='';i.dispatchEvent(new Event('input'));});
  ok('… and clearing the search collapses it again',(await folds()).split(' ').every(f=>f.startsWith('-'))&&await vis('#shTools'));
  // the List view has no shelves to collapse
  await page.click('#segView [data-v="list"]');await page.waitForSelector('.tbl');
  ok('List view: no New shelf or Collapse all, and the table lists every book',!(await vis('#shTools'))&&(await page.$$('.tbl tbody tr')).length===4);
  await page.click('#segView [data-v="shelves"]');
  ok('back in the Shelves view, the shelves are still collapsed',(await folds()).split(' ').every(f=>f.startsWith('-')));

  // a shelf dragged by its name to another place: mouse
  await page.setViewport(PHONE);await reload();await spy();
  const sm=await mouseShelf(poetry,'adventure',{drop:false});
  const between=await page.evaluate((y,a,b)=>{const r=s=>document.querySelector(s).getBoundingClientRect();return y>=r(a).bottom-1&&y<=r(b).top+1;},sm.mark,rowSel('travel'),rowSel('adventure'));
  ok('mouse: pressing a shelf\'s name and moving lifts it, and its place fades',sm.lifted&&sm.faded);
  ok('mouse: a line shows where it will land (between Travel and Adventure)',sm.mark!=null&&between);
  await shoot('shelf-drag-390',{});
  await page.mouse.up();
  ok('mouse: dropping it there reorders the shelves',(await names())===`Travel|Poetry|Adventure|Finance|Fantasy|Philosophy|Maps`&&!(await page.$('.drag-ghost,.shelf-mark'))&&!(await vis('#shelfM')));
  ok('… with one write of the shelf list',(await puts())['settings:app']===1&&Object.keys(await puts()).length===1&&(await idb('settings:app')).shelves.map(s=>s.name).join('|')==='Travel|Poetry|Adventure|Finance|Fantasy|Philosophy|Maps');
  ok('… and the shelves stay collapsed',(await folds()).split(' ').every(f=>f.startsWith('-')));
  await spy();
  const end=await mouseShelf('travel','',{drop:true,last:true});
  ok('mouse: below the last shelf, a shelf goes to the end',end.mark!=null&&(await names())===`Poetry|Adventure|Finance|Fantasy|Philosophy|Maps|Travel`&&(await puts())['settings:app']===1);
  await spy();
  const same=await mouseShelf('finance','fantasy',{frac:.1});
  ok('mouse: dropped back where it was: no line, no write, no dialog',same.lifted&&same.mark==null&&(await names())===`Poetry|Adventure|Finance|Fantasy|Philosophy|Maps|Travel`&&!Object.keys(await puts()).length&&!(await vis('#shelfM')));
  await mouseShelf(maps.id,poetry,{drop:false});await page.keyboard.press('Escape');await page.mouse.up();
  ok('Escape puts a dragged shelf back',!(await page.$('.drag-ghost,.shelf-mark,.shelf-row.lifted'))&&(await names())===`Poetry|Adventure|Finance|Fantasy|Philosophy|Maps|Travel`&&!Object.keys(await puts()).length);
  await page.click(nameSel('finance'));await page.waitForSelector('#shelfM:not(.hidden)');
  ok('a click on a shelf\'s name still opens its dialog, with Move up and Move down',(await page.$eval('#shName',i=>i.value))==='Finance'&&await vis('#shMove'));
  await page.click('#shelfM [data-cancel]');
  await reload();
  ok('the new order is kept after a reload',(await names())===`Poetry|Adventure|Finance|Fantasy|Philosophy|Maps|Travel`);
  // the page scrolls near the bottom edge while dragging a shelf (every shelf open, so the page is long)
  await page.click('#foldAll');await page.evaluate(()=>scrollTo(0,0));
  {
    const a=await spot(nameSel(poetry),false);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+12,a.y+12,{steps:3});
    const y0=await page.evaluate(()=>scrollY);await page.mouse.move(a.x,836,{steps:4});await sleep(600);
    ok('dragging a shelf near the bottom edge scrolls the page',(await page.evaluate(()=>scrollY))>y0+150&&await page.$('.shelf-label.drag-ghost'));
    await page.keyboard.press('Escape');await page.mouse.up();
  }
  // Unsorted stays first: it has no name to drag
  await details('Atlas of Winds');await page.select('#dShelf','');await page.click('#dSave');await until(()=>document.querySelector('#detM').classList.contains('hidden'));
  {
    const a=await spot(rowSel('')+' .shelf-label span');
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+12,a.y+60,{steps:4});
    ok('Unsorted can\'t be dragged',!(await page.$('.drag-ghost'))&&!(await page.$(rowSel('')+' .sl-name')));
    await page.mouse.up();
  }

  // touch: hold a shelf's name, then drag; a swipe scrolls; a tap opens the dialog
  await page.setViewport({...TALL,isMobile:true,hasTouch:true});await reload();await spy();
  await page.evaluate(()=>window.addEventListener('touchmove',e=>{window.__tm.n++;if(e.defaultPrevented)window.__tm.prevented++;},{passive:true}));
  const ts=await touchShelf('travel','adventure');
  ok('touch: holding a shelf\'s name lifts it, and a line shows where it will land',ts.lifted&&ts.mark!=null);
  ok('touch: the page doesn\'t scroll while dragging a shelf',ts.tm.n>0&&ts.tm.prevented===ts.tm.n);
  ok('touch: lifting the finger reorders the shelves, Unsorted still first, one write',(await names())==='Unsorted|Poetry|Travel|Adventure|Finance|Fantasy|Philosophy|Maps'&&(await puts())['settings:app']===1);
  {
    const a=await spot(nameSel('finance'));await page.evaluate(()=>{window.__tm={n:0,prevented:0};});
    await page.touchscreen.touchStart(a.x,a.y);
    for(let i=1;i<=6;i++){await page.touchscreen.touchMove(a.x+3*i,a.y-25*i);await sleep(15);}
    const g=await page.$('.drag-ghost');await page.touchscreen.touchEnd();await sleep(500);
    const tm=await page.evaluate(()=>window.__tm);
    ok('touch: a quick swipe on a shelf\'s name scrolls, and lifts nothing',!g&&tm.n>0&&tm.prevented===0&&!(await vis('#shelfM')));
  }
  await page.touchscreen.tap(...Object.values(await spot(nameSel('fantasy'))));await page.waitForSelector('#shelfM:not(.hidden)');
  ok('touch: a tap on a shelf\'s name opens its dialog',(await page.$eval('#shName',i=>i.value))==='Fantasy');
  await page.click('#shelfM [data-cancel]');
  // while searching, some shelves are hidden: a shelf's name doesn't drag
  await page.type('#q','salt');
  {
    const a=await spot(nameSel('finance'));await page.touchscreen.touchStart(a.x,a.y);await sleep(550);
    ok('while searching, holding a shelf\'s name lifts nothing',!(await page.$('.drag-ghost')));
    await page.touchscreen.touchEnd();await sleep(100);
    if(await vis('#shelfM')) await page.click('#shelfM [data-cancel]'); // a long press may count as a tap
  }
  await page.$eval('#q',i=>{i.value='';i.dispatchEvent(new Event('input'));});
  await page.setViewport(DESK);await page.evaluate(()=>scrollTo(0,0));
  await shoot('shelves-tools-1280',{});
  await page.setViewport(PHONE);
});
