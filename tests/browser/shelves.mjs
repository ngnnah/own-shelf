// Arrange by Shelf: category shelves (one per book, kept in its reading state), dragging covers between them with a
// mouse and with a finger, the Shelf picker in Book details, new, rename, move and delete, search, the List view and backups.
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
const rows=(p=page)=>p.$$eval('#shelfBody .shelf-row',rs=>rs.map(r=>({id:r.dataset.shelf,name:r.querySelector('.shelf-label').firstChild.textContent.trim(),
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
  await page.click('#shelfBody [data-shelf-new]');await page.waitForSelector('#shelfM:not(.hidden)');
  ok('+ New shelf asks for a name',(await text('#shH'))==='New shelf'&&!(await vis('#shDel'))&&!(await vis('#shMove')));
  await outside();
  ok('a tap outside with nothing typed just closes',await until(()=>document.querySelector('#shelfM').classList.contains('hidden'))&&(await names())==='Travel|Adventure|History|Finance|Fantasy|Philosophy');
  await page.click('#shelfBody [data-shelf-new]');await page.waitForSelector('#shelfM:not(.hidden)');
  await page.type('#shName','Poetry');await outside();await until(()=>document.querySelector('#shelfM').classList.contains('hidden'));
  ok('a tap outside with a name typed adds the shelf, at the end, empty with its hint',(await names())==='Travel|Adventure|History|Finance|Fantasy|Philosophy|Poetry'&&(await rows()).find(r=>r.name==='Poetry').hint);
  await page.click('#shelfBody [data-shelf-new]');await page.waitForSelector('#shelfM:not(.hidden)');
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
  ok('search: only shelves with a match show',(await names())==='Finance|Philosophy'&&!(await page.$('#shelfBody [data-shelf-new]')));
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
});
