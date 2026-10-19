// The Notebook: every highlight on the shelf in one list. Usage: node tests/browser/notebook.mjs [repo dir]
import {start,enterLocalMode,addQuietEngine,highlightQuietEngine,addFootnoteBook} from './lib.mjs';

const t=await start('notebook',8122);
const {page,ok,must,vis,text,until}=t;

await t.run(async()=>{
  await enterLocalMode(t,must);

  // loading state, then the empty state
  ok('shelf has the Notebook button, not Export notes',await vis('#nbBtn')&&!(await page.$('#expShelf')));
  const loading=await page.evaluate(()=>{document.querySelector('#nbBtn').click();return document.querySelector('#nbList').textContent;});
  ok('notebook shows a loading state',loading==='Gathering your highlights…'&&await vis('#notebook')&&!(await vis('#shelf')));
  await until(()=>document.querySelector('#nbList').textContent.includes('No highlights yet'));
  ok('empty notebook explains how to highlight',(await text('#nbList'))==='No highlights yet.Select any passage while reading and pick a color.'&&!(await vis('#nbCtrl')));
  await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');
  ok('Shelf button leaves the notebook',!(await vis('#notebook')));

  // two books: The Quiet Engine with 2 mint highlights, the older one with a note; Footnote Test with 1 sunny one
  await addQuietEngine(t,must);
  await highlightQuietEngine(t,must);
  await page.click('mark.hl.c-mint');await until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.click('#tool [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  await page.type('#noteTa','Worth rereading. Ghi chú: đọc lại.');await page.click('#noteSave');
  ok('note saved on the highlight',(await page.$$('mark.hl.noted')).length>0&&!(await vis('#noteBox')));
  await addFootnoteBook(t,must);
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');

  const cards=()=>page.$$eval('#nbList .hcard',els=>els.length);
  const titles=()=>page.$$eval('#nbList .hcard .sec b',els=>els.map(e=>e.textContent));
  const chips=()=>page.$$eval('#nbChips .chip',els=>els.map(e=>e.textContent));
  const search=q=>page.$eval('#nbQ',(e,q)=>{e.value=q;e.dispatchEvent(new Event('input',{bubbles:true}));},q);
  const chip=f=>page.click(`#nbChips [data-f="${f}"]`);
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  await page.click('#nbBtn');await page.waitForSelector('#nbList .hcard',{timeout:5000});
  ok('notebook lists every highlight',await cards()===3);
  ok('notebook stats',(await text('#nbStats'))==='3 highlights · 1 note · 2 books');
  ok('newest highlight first',same(await titles(),['Footnote Test','The Quiet Engine','The Quiet Engine']));
  ok('card shows section, quote and note',(await page.$eval('#nbList .hcard:last-child',e=>e.querySelector('.nt')?.textContent))==='Worth rereading. Ghi chú: đọc lại.'&&(await text('#nbList .hcard:first-child .sec')).includes('Notes'));
  ok('chips: All, With note, one per color present',same(await chips(),['All 3','With note 1','Sunny 1','Mint 2']));
  ok('no horizontal scroll at phone width',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await t.shot('light',{fullPage:true});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await t.shot('dark',{fullPage:true});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);

  // chips, search, book filter (all re-render synchronously)
  await chip('note');
  ok('With note chip filters to 1 card',await cards()===1&&(await page.$$('#nbList .hcard .nt')).length===1);
  await chip('sun');
  ok('color chip filters (Sunny)',await cards()===1&&(await titles())[0]==='Footnote Test');
  await chip('mint');
  ok('color chip filters (Mint)',await cards()===2);
  await chip('all');await search('source of the claim');
  ok('search matches quote text',await cards()===1&&(await titles())[0]==='Footnote Test');
  await search('ADA rivers');
  ok('search matches author, ignoring case',await cards()===2);
  await search('doc lai');
  ok('search matches notes, ignoring accents and đ',await cards()===1);
  await search('quíet');
  ok('search matches titles, ignoring accents',await cards()===2);
  await search('zzzz');
  ok('no-match state',(await text('#nbList'))==='Nothing matches.');
  await search('');
  const bookId=title=>page.$eval('#nbBook',(s,title)=>[...s.options].find(o=>o.text===title).value,title);
  ok('book filter lists All books and each book',same(await page.$$eval('#nbBook option',o=>o.map(x=>x.text)),['All books','Footnote Test','The Quiet Engine']));
  await page.select('#nbBook',await bookId('Footnote Test'));
  ok('book filter',await cards()===1&&(await titles())[0]==='Footnote Test');
  await page.select('#nbBook',await bookId('The Quiet Engine'));await chip('note');await search('rereading');
  ok('filters combine (book + chip + search)',await cards()===1&&same(await chips(),['All 1','With note 1','Mint 1']));
  await t.shot('filtered',{fullPage:true});
  await search('source');
  ok('combined filters with no match',(await text('#nbList'))==='Nothing matches.');

  // export the whole shelf from the notebook
  await page.click('#nbExp');await page.waitForSelector('#expM:not(.hidden)');
  await until(()=>document.querySelector('#expSum').textContent.includes('from 2 books'));
  const ex={wrap:await vis('#expScopeWrap'),sum:await text('#expSum'),prev:await text('#expPrev')};
  // the preview is in the last format picked (Markdown by default): "# My reading notes" or "My reading notes"
  ok('Export… opens the export dialog for the whole shelf',!ex.wrap&&ex.sum==='3 highlights, 1 with notes, from 2 books.'&&/^(# )?my reading notes/i.test(ex.prev)&&/footnote test/i.test(ex.prev)&&/the quiet engine/i.test(ex.prev));
  await page.keyboard.press('Escape');
  ok('closing export returns to the notebook',await vis('#notebook')&&!(await vis('#expM')));

  // reopening reloads and resets the filters
  await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#nbBtn');await page.waitForSelector('#nbList .hcard',{timeout:5000});
  ok('reopening resets the filters',await cards()===3&&(await page.$eval('#nbQ',e=>e.value))===''&&(await page.$eval('#nbBook',e=>e.value))==='');

  // tapping a card opens the reader at that highlight
  const inView=h=>page.$eval(`mark[data-h="${h}"]`,m=>{const r=m.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.height>0;}).catch(()=>false);
  const tap=await page.$eval('#nbList .hcard:first-child',e=>({b:e.dataset.book,h:e.dataset.hl}));
  await page.click('#nbList .hcard:first-child');await t.reader();
  ok('tapping a card opens the book at that highlight',(await text('.hero h1')).includes('Footnote')&&await inView(tap.h)&&await page.evaluate(()=>scrollY>200));
  // opening from the shelf still restores the reading position
  const pos=await page.evaluate(()=>scrollY);
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click(`.cover[data-open="${tap.b}"]`);await t.reader();
  ok('opening from the shelf restores the saved position',Math.abs(await page.evaluate(()=>scrollY)-pos)<5);
  // Enter on a focused card opens it too
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#nbBtn');await page.waitForSelector('#nbList .hcard',{timeout:5000});
  const last=await page.$eval('#nbList .hcard:last-child',e=>e.dataset.hl);
  await page.focus('#nbList .hcard:last-child');await page.keyboard.press('Enter');await t.reader();
  ok('Enter on a card opens that highlight',(await text('.hero h1')).includes('Quiet')&&await inView(last));
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  await t.shot('shelf-top');
});
