// The Grid view: a third choice under View, kept per device, always by shelf. A tray of Unsorted's books (newest
// first, scrolling sideways inside itself) over a tile per shelf (name, count, up to four small covers; two columns on
// a phone, more on a wide screen). Covers dragged from the tray onto a tile with a mouse and with a finger (the tile
// lights up; one write to the shelf entry and one to the state; the toast; no page scrolling needed on a phone); a tap
// or click on a book still opens it; tapping a tile puts its shelf in the tray (marked, ← Unsorted or the tile again
// goes back, ← Unsorted takes a dropped book); search shows the Shelves view's results; Arrange by in Grid; + New shelf;
// an empty Unsorted. Usage: node tests/browser/grid.mjs [repo dir].
// Screenshots: tests/browser/out/grid/ (390 and 1280 px, light and dark).
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {start,sleep,enterLocalMode,addMarkdown} from './lib.mjs';

const t=await start('grid',8165);
const {page,ok,must,vis,text,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','grid');mkdirSync(shots,{recursive:true});
const md=title=>`# ${title}\n\n`+'Plain words for a plain test book on the shelf. '.repeat(10);
const KINDLE='The Lighthouse Ledger (Harbour Tales Book 2)';
const BOOKS=['Atlas of Winds','A Ledger of Kings','Salt and Sails','The Copper Road','Night Ferries','Orchard Letters','Maps of the Interior','Quiet Harbours'];
const home=async()=>{await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');};
// Before a reload, let the writes land (IndexedDB runs a store's readwrite transactions in order)
const settle=()=>page.evaluate(()=>new Promise(res=>{const r=indexedDB.open('upwind',1);r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite');tx.objectStore('kv').get('-');tx.oncomplete=()=>{r.result.close();res();};};}));
const reload=async()=>{await sleep(150);await settle();await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden)');};
const prefs=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:prefs')||'{}'));
const idb=key=>page.evaluate(k=>new Promise(res=>{const r=indexedDB.open('upwind',1);r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get(k);g.onsuccess=()=>{r.result.close();res(g.result);};};}),key);
// counts the page's writes to its store from here on, by key
const spy=()=>page.evaluate(()=>{window.__puts={};const P=IDBObjectStore.prototype;if(P.__spied) return;P.__spied=1;
  const put=P.put;P.put=function(v,k){window.__puts[k]=(window.__puts[k]||0)+1;return put.apply(this,arguments);};});
const puts=()=>page.evaluate(()=>window.__puts);
const cov=title=>`.cover[aria-label^="${title.replace(/"/g,'\\"')}"]`;
const tileSel=id=>`#shelfBody .g-tile[data-shelf="${id}"]`;
const idOf=title=>page.$eval(cov(title),c=>c.dataset.open);
// the tray: the shelf it shows, its count, its titles, its hint, its ← Unsorted
const tray=()=>page.$eval('#shelfBody .g-tray',tr=>({name:tr.querySelector('.shelf-label>span').textContent,count:(tr.querySelector('.shelf-label small')||{}).textContent||'',
  books:[...tr.querySelectorAll('.c-t')].map(x=>x.textContent),hint:(tr.querySelector('.g-hint')||{}).textContent||'',back:!!tr.querySelector('.g-back')})).catch(()=>null);
const tiles=()=>page.$$eval('#shelfBody .g-tile',ts=>ts.map(x=>({id:x.dataset.shelf,name:x.querySelector('.g-name').textContent,count:(x.querySelector('small')||{}).textContent||'',
  minis:x.querySelectorAll('.g-mini').length,hint:!!x.querySelector('.sl-hint'),pressed:x.getAttribute('aria-pressed')==='true'})));
const tile=async id=>(await tiles()).find(x=>x.id===id);
// the shelf rows of the Shelves view's layout: names and titles
const rows=()=>page.$$eval('#shelfBody .shelf-row',rs=>rs.map(r=>r.querySelector('.shelf-label :is(.sl-name,span)').textContent.trim()+':'+[...r.querySelectorAll('.c-t')].map(x=>x.textContent).join(',')).join('|'));
// a point inside an element; a cover in the tray is first brought into view inside the tray (the page stays put)
const spot=sel=>page.$eval(sel,e=>{if(e.closest('.g-tray .books'))e.scrollIntoView({block:'nearest',inline:'center'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+Math.min(r.height/2,40)};});
const toastHas=s=>until(s=>document.querySelector('#toast').classList.contains('on')&&document.querySelector('#toast').textContent.includes(s),s);
const lit=()=>page.$$eval('#shelfBody .drop',rs=>rs.map(r=>r.dataset.shelf));
const ghost=()=>page.$('.drag-ghost').then(Boolean);
const trayTop=()=>page.evaluate(()=>{const tr=document.querySelector('#shelfBody .g-tray');scrollTo(0,tr.getBoundingClientRect().top+scrollY-8);});
const scheme=s=>page.emulateMediaFeatures([{name:'prefers-color-scheme',value:s}]);
// (the tiles fade between the schemes' colours: wait that out)
const shoot=async(label,opts={})=>{for(const s of ['light','dark']){await scheme(s);await sleep(250);await page.screenshot({path:join(shots,`${label}-${s}.png`),...opts});}await scheme('light');};
const PHONE={width:390,height:844,deviceScaleFactor:2},TOUCH={...PHONE,isMobile:true,hasTouch:true},DESK={width:1280,height:900,deviceScaleFactor:1};
const noSideways=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
const columns=()=>page.$$eval('#shelfBody .g-tile',ts=>new Set(ts.map(x=>Math.round(x.getBoundingClientRect().left))).size);

// Mouse: press on the cover, move past the threshold, then onto the target (a selector), and let go there.
async function mouseDrag(title,to,{drop=true}={}){
  const a=await spot(cov(title));
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+12,a.y+12,{steps:3});
  const b=await page.$eval(to,e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});await page.mouse.move(b.x,b.y,{steps:8});
  const r={lifted:await ghost(),lit:await lit()};
  if(drop) await page.mouse.up();
  return r;
}
// Touch: hold the cover ~0.55 s, then move the finger onto the target in steps, and lift it.
async function touchDrag(title,to){
  const a=await spot(cov(title));
  await page.evaluate(()=>{window.__tm={n:0,prevented:0};});
  await page.touchscreen.touchStart(a.x,a.y);await sleep(550);
  const lifted=await ghost(),b=await page.$eval(to,e=>{const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
  for(let i=1;i<=8;i++) await page.touchscreen.touchMove(a.x+(b.x-a.x)*i/8,a.y+(b.y-a.y)*i/8);
  const r={lifted,lit:await lit()};await page.touchscreen.touchEnd();
  r.tm=await page.evaluate(()=>window.__tm);return r;
}
const countTouchMoves=()=>page.evaluate(()=>window.addEventListener('touchmove',e=>{window.__tm.n++;if(e.defaultPrevented)window.__tm.prevented++;},{passive:true}));
// one write to the book's shelf entry and one to its state, nothing else (the state is written a moment later)
async function wroteOnce(id){
  await until(id=>window.__puts&&window.__puts['state:'+id],id);await settle();
  const p=await puts();return Object.keys(p).length===2&&p['meta:'+id]===1&&p['state:'+id]===1;
}

await t.run(async()=>{
  await enterLocalMode(t,must);
  for(const title of BOOKS){await addMarkdown(t,title.replace(/\W/g,'')+'.md',md(title),title);await home();}
  const k=join(t.tmp,'k.html');writeFileSync(k,readFileSync(join(t.repo,'tests/fixtures/kindle-notebook.html'),'utf8'));
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');await (await page.$('#file')).uploadFile(k);
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));await page.click('#impGo');await t.reader();await home();
  const NEWEST=[KINDLE,...[...BOOKS].reverse()];

  // the View control, and Grid kept per device
  ok('View offers Shelves, List and Grid',(await page.$$eval('#segView button',bs=>bs.map(b=>b.textContent).join('|')))==='Shelves|List|Grid');
  await page.click('#segView [data-v="grid"]');
  ok('Grid: a tray over a tile per shelf, and Grid is pressed',!!(await tray())&&(await tiles()).map(x=>x.name).join('|')==='Travel|Adventure|History|Finance|Fantasy|Philosophy'
    &&(await page.$eval('#segView [data-v="grid"]',b=>b.getAttribute('aria-pressed')))==='true'&&!(await page.$('#shelfBody .shelf-row')));
  ok('Grid arranges by shelf: Arrange by shows Shelf',(await page.$eval('#segGroup [aria-pressed="true"]',b=>b.dataset.g))==='shelf');
  await reload();
  ok('Grid is kept after a reload (this device\'s prefs)',(await prefs()).view==='grid'&&!!(await tray()));

  // the tray: Unsorted, newest first; the tiles: empty, none marked
  let tr=await tray();
  ok('the tray shows Unsorted\'s books, newest first, with the count',tr.name==='Unsorted'&&tr.count==='9'&&tr.books.join('|')===NEWEST.join('|')&&!tr.back);
  ok('every tile is empty, with a hint to drag books there, none marked',(await tiles()).every(x=>x.hint&&!x.count&&!x.minis&&!x.pressed));
  ok('+ New shelf shows in Grid; Collapse all doesn\'t',await vis('#shTools [data-shelf-new]')&&!(await vis('#foldAll')));
  ok('two columns of tiles at 390 px',(await columns())===2);
  ok('no sideways scroll on the page',await noSideways());
  ok('the tray scrolls sideways inside itself',await page.$eval('#shelfBody .g-tray .books',b=>b.scrollWidth>b.clientWidth+50&&getComputedStyle(b).overflowX==='auto'));
  await trayTop();
  const fit=await page.evaluate(()=>{const tr=document.querySelector('.g-tray').getBoundingClientRect(),ts=[...document.querySelectorAll('.g-tile')];return Math.max(...ts.map(x=>x.getBoundingClientRect().bottom))-tr.top;});
  ok('the tray and every tile fit one phone screen',fit<=844-60);
  await shoot('start-390');

  // mouse: from the tray onto a tile, at phone size, without scrolling the page
  await spy();const y0=await page.evaluate(()=>scrollY);
  const atlas=await idOf('Atlas of Winds');
  const m1=await mouseDrag('Atlas of Winds',tileSel('history'),{drop:false});
  const size=await page.evaluate(()=>[document.querySelector('.drag-ghost .cover'),document.querySelector('.book.lifted .cover')].map(c=>c.getBoundingClientRect().width));
  ok('the lifted book keeps the tray\'s smaller size',size[1]<130&&Math.abs(size[0]-size[1])<12);
  await sleep(250);await shoot('drag-390');
  await page.mouse.up();
  ok('mouse: the book lifts and the tile under the pointer lights up',m1.lifted&&m1.lit.join()==='history');
  ok('mouse: dropping moves the book there, with a toast',await toastHas('Moved to History')&&!(await tray()).books.includes('Atlas of Winds')&&(await tile('history')).count==='1'&&(await tile('history')).minis===1);
  ok('mouse: … one write to the shelf entry and one to the state',await wroteOnce(atlas));
  ok('mouse: … into its state and shelf entry, never its doc',(await idb('state:'+atlas)).shelf==='history'&&(await idb('meta:'+atlas)).shelf==='history'&&!('shelf' in (await idb('doc:'+atlas))));
  ok('mouse: the page didn\'t scroll, and no ghost is left',(await page.evaluate(()=>scrollY))===y0&&!(await ghost())&&!(await lit()).length&&await vis('#shelf'));
  // the tray keeps its sideways place after a drop
  {
    await page.$eval('#shelfBody .g-tray .books',b=>{b.scrollLeft=b.scrollWidth;});const x0=await page.$eval('#shelfBody .g-tray .books',b=>b.scrollLeft);
    const last=(await tray()).books.at(-1);await mouseDrag(last,tileSel('history'));await toastHas('Moved to History');
    const x1=await page.$eval('#shelfBody .g-tray .books',b=>b.scrollLeft);
    ok('after a drop the tray stays scrolled where it was',x0>0&&x1>0&&Math.abs(x1-x0)<200);
  }
  // a click on a book in the tray opens it
  await page.click(cov('Orchard Letters'));await t.reader();
  ok('mouse: a click on a book in the tray opens it',(await page.title()).startsWith('Orchard Letters'));
  await home();
  ok('back from the book: still the Grid',!!(await tray())&&(await prefs()).view==='grid');

  // touch: hold a cover in the tray, then drag it onto a tile
  await page.setViewport(TOUCH);await reload();await countTouchMoves();await trayTop();await spy();
  const salt=await idOf('Salt and Sails');
  const t1=await touchDrag('Salt and Sails',tileSel('travel'));
  ok('touch: holding a cover lifts the book',t1.lifted);
  ok('touch: the tile under the finger lights up',t1.lit.join()==='travel');
  ok('touch: the page doesn\'t scroll while dragging',t1.tm.n>0&&t1.tm.prevented===t1.tm.n);
  ok('touch: lifting the finger moves the book, with a toast',await toastHas('Moved to Travel')&&(await tile('travel')).count==='1'&&!(await tray()).books.includes('Salt and Sails'));
  ok('touch: … one write to the shelf entry and one to the state',await wroteOnce(salt));
  // a few more, so the tiles show their covers (one a Kindle notebook's ruled one)
  for(const [title,to] of [[KINDLE,'philosophy'],['The Copper Road','history'],['Night Ferries','history'],['Maps of the Interior','travel']]){await touchDrag(title,tileSel(to));await toastHas('Moved to');}
  ok('a tile shows at most four covers, and the count',(await tile('history')).count==='4'&&(await tile('history')).minis===4&&(await tile('philosophy')).minis===1
    &&await page.$eval(tileSel('philosophy')+' .g-mini',m=>m.classList.contains('nb')));
  // a tap on a book in the tray still opens it
  await page.touchscreen.tap(...Object.values(await spot(cov('Quiet Harbours'))));await t.reader();
  ok('touch: a tap on a book in the tray opens it',(await page.title()).startsWith('Quiet Harbours'));
  await home();await trayTop();
  ok('Unsorted now holds the two books left',(await tray()).books.join('|')==='Quiet Harbours|Orchard Letters');
  await shoot('grid-390');

  // tapping a tile puts its shelf in the tray; ← Unsorted, or the tile again, goes back
  await page.touchscreen.tap(...Object.values(await spot(tileSel('history'))));
  tr=await tray();
  ok('a tap on a tile puts its books in the tray, labelled with its name',tr.name==='History'&&tr.count==='4'&&tr.books.join('|')==='Night Ferries|The Copper Road|A Ledger of Kings|Atlas of Winds');
  ok('… with ← Unsorted, and the tile marked',tr.back&&(await page.$eval('#shelfBody .g-back',b=>b.textContent))==='← Unsorted'&&(await tiles()).filter(x=>x.pressed).map(x=>x.id).join()==='history');
  await trayTop();await shoot('picked-390');
  // a book dragged from it onto ← Unsorted goes back to Unsorted
  const t2=await touchDrag('Atlas of Winds','#shelfBody .g-back');
  ok('touch: ← Unsorted lights up under the finger',t2.lifted&&t2.lit.length===1&&t2.lit[0]==='');
  ok('… and takes the book back to Unsorted',await toastHas('Moved to Unsorted')&&!(await tray()).books.includes('Atlas of Winds')&&(await idb('meta:'+atlas)).shelf==='');
  // a book dragged from it onto another tile
  await touchDrag('A Ledger of Kings',tileSel('fantasy'));
  ok('a book from the picked shelf onto another tile moves it; the tray stays on History',await toastHas('Moved to Fantasy')&&(await tray()).name==='History'&&(await tile('fantasy')).count==='1');
  await page.touchscreen.tap(...Object.values(await spot('#shelfBody .g-back')));
  tr=await tray();
  ok('← Unsorted brings Unsorted back, no tile marked',tr.name==='Unsorted'&&!tr.back&&tr.books.includes('Atlas of Winds')&&!(await tiles()).some(x=>x.pressed));
  await page.touchscreen.tap(...Object.values(await spot(tileSel('travel'))));
  ok('another tile shows its shelf',(await tray()).name==='Travel'&&(await tile('travel')).pressed);
  await page.touchscreen.tap(...Object.values(await spot(tileSel('travel'))));
  ok('tapping the marked tile again goes back to Unsorted',(await tray()).name==='Unsorted'&&!(await tiles()).some(x=>x.pressed));
  await page.focus(tileSel('finance'));await page.keyboard.press('Enter');
  ok('from the keyboard, an empty shelf\'s tile shows it, and the focus stays on the tile',(await tray()).name==='Finance'&&(await tray()).hint.includes('No books')
    &&await page.evaluate(()=>document.activeElement.matches('.g-tile[data-shelf="finance"]')));
  await page.keyboard.press('Enter');
  ok('… and Enter again goes back',(await tray()).name==='Unsorted');

  // search: the Shelves view's results
  await page.setViewport(PHONE);await reload();
  await page.type('#q','or');
  const found=await rows();
  ok('search in Grid shows the shelves with a match, as the Shelves view does',!(await tray())&&!(await page.$('#shelfBody .g-tile'))&&found==='Unsorted:Orchard Letters|Travel:Maps of the Interior'&&!(await vis('#shTools')));
  await page.click('#segView [data-v="shelves"]');
  ok('… the same as the Shelves view\'s',(await rows())===found);
  await page.click('#segView [data-v="grid"]');
  await page.$eval('#q',i=>{i.value='';i.dispatchEvent(new Event('input'));});
  ok('clearing the search brings the tray and tiles back',!!(await tray())&&(await tiles()).length===6&&await vis('#shTools'));
  await page.setViewport(DESK);await page.evaluate(()=>scrollTo(0,0));await shoot('grid-1280',{fullPage:true});await page.setViewport(PHONE);

  // Arrange by in Grid: Shelf stays; another choice goes to the Shelves view arranged that way
  await page.click('#segGroup [data-g="shelf"]');
  ok('choosing Shelf in Grid keeps the Grid',!!(await tray()));
  await page.click('#segGroup [data-g="title"]');
  ok('choosing Title in Grid goes to the Shelves view by title',(await prefs()).view==='shelves'&&(await prefs()).group==='title'&&!(await tray())
    &&(await page.$eval('#segView [aria-pressed="true"]',b=>b.dataset.v))==='shelves');
  await page.click('#segView [data-v="grid"]');
  ok('Grid again: by shelf, while Arrange by keeps Title for the Shelves view',!!(await tray())&&(await page.$eval('#segGroup [aria-pressed="true"]',b=>b.dataset.g))==='shelf'&&(await prefs()).group==='title');
  await page.click('#segView [data-v="shelves"]');await page.click('#segGroup [data-g="shelf"]');await page.click('#segView [data-v="grid"]');

  // + New shelf in Grid: a tile at the end
  await page.click('#shTools [data-shelf-new]');await page.waitForSelector('#shelfM:not(.hidden)');await page.type('#shName','Poetry');await page.click('#shSave');
  await until(()=>document.querySelector('#shelfM').classList.contains('hidden'));
  // the page smooth-scrolls to the new tile; a drag measured mid-scroll misses its cover, so wait for it to stop
  await until(()=>new Promise(r=>{const y=scrollY;setTimeout(()=>r(scrollY===y),150);}));
  const poetry=(await tiles()).at(-1);
  ok('+ New shelf adds a tile at the end, empty',poetry.name==='Poetry'&&poetry.hint&&(await tiles()).length===7);

  // an empty Unsorted
  for(const title of (await tray()).books){await mouseDrag(title,tileSel(poetry.id));await toastHas('Moved to Poetry');}
  tr=await tray();
  ok('an empty Unsorted: the tray says every book is on a shelf',tr.name==='Unsorted'&&!tr.books.length&&!tr.count&&tr.hint.startsWith('Every book is on a shelf'));
  ok('… the tiles still show, Poetry with its books',(await tiles()).length===7&&(await tile(poetry.id)).count==='3'&&(await tile(poetry.id)).minis===3);
  ok('no sideways scroll with an empty Unsorted',await noSideways());
  await trayTop();await shoot('empty-390');
  // at 320 px, still two columns and no sideways scroll
  await page.setViewport({width:320,height:700,deviceScaleFactor:2});
  ok('320 px: two columns, no sideways scroll',(await columns())===2&&await noSideways());

  // a wide screen: more columns; screenshots with books in the tray
  await page.setViewport(DESK);
  await page.click(tileSel(poetry.id));
  ok('1280 px: five columns or more',(await columns())>=5&&await noSideways());
  await trayTop();await shoot('picked-1280');
  await mouseDrag('Atlas of Winds',tileSel('adventure'),{drop:false});await sleep(250);await shoot('drag-1280');
  await page.mouse.up();
  ok('a drag at desktop size moves the book too',await toastHas('Moved to Adventure')&&(await tile('adventure')).count==='1');
  await page.setViewport(PHONE);
});
