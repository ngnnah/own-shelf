// Search inside a book. Usage: node tests/browser/search.mjs [repo dir]
import {start,sleep,enterLocalMode,addQuietEngine,addMarkdown} from './lib.mjs';

const t=await start('search',8123);
const {page,ok,must,text}=t;

await t.run(async()=>{
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await enterLocalMode(t,must);
  await addQuietEngine(t,must); // a second book, to check the search resets per book
  await addMarkdown(t,'search-test.md',['# Lantern Search Test','','By Sam Tester','',
    'Tiếng Việt is spoken here. The harbour lantern glowed over the quay, and the boats came home slowly through the fog.','',
    '## The lantern keeper','',
    'A claim with a source [1]. The zebra passage follows here, after the note marker, and then the paragraph goes on.','',
    'Filler words for the body of the text. '.repeat(80),'',
    '## Night watch','',
    'The keeper lit the lantern again at dusk, and once more at midnight the lantern burned.','',
    'More filler words for the body. '.repeat(80),'',
    'Notes','','[1] A note about the old lantern.',''].join('\n'),'Lantern Search Test');
  ok('book with a footnote opened',(await text('.hero h1')).includes('Lantern')&&(await page.$$('.fn')).length===1);
  ok('reader bar fits at phone width',await page.evaluate(()=>{const b=document.querySelector('#bar .bar-in');const r=document.querySelector('#bHl').getBoundingClientRect();return b.scrollWidth<=b.clientWidth&&r.right<=innerWidth&&document.querySelector('#bFind').getBoundingClientRect().width>0;}));

  const findOpen=()=>page.$eval('#find',e=>e.classList.contains('open'));
  const hits=async()=>(await page.$$('#findList .fhit')).length;
  const marked=()=>page.evaluate(()=>{if(!CSS.highlights||!CSS.highlights.has('find'))return null;return [...CSS.highlights.get('find')][0].toString();});
  const setQuery=q=>page.$eval('#findQ',(e,q)=>{e.value=q;e.dispatchEvent(new Event('input',{bubbles:true}));},q);
  // Type a query and wait for the debounced search to update the count line. A one-character query
  // must not search, so there is nothing to wait for: give the 200 ms debounce time to (not) fire.
  const find=async q=>{if(q.length<2){await setQuery(q);await sleep(300);}else await t.afterChange('#findSub',()=>setQuery(q));};
  const openHit=async()=>{await page.click('#findList .fhit');await t.drawersGone();};

  await t.openDrawer('#bFind','#find');
  ok('drawer opens and focuses the input',await findOpen()&&await page.evaluate(()=>document.activeElement&&document.activeElement.id==='findQ'));
  await find('l');
  ok('one character does not search',await hits()===0&&(await text('#findSub'))==='');
  await find('LANTERN');
  const sub=await text('#findSub'),n=await hits();
  ok(`count line matches the results ("${sub}", ${n} results)`,sub==='5 matches'&&n===5);
  ok('headings and notes are searched',await page.evaluate(()=>{const t=[...document.querySelectorAll('#findList .fhit')].map(b=>b.textContent);return t.some(x=>x.includes('The lantern keeper')&&x.startsWith('2.'))&&t[t.length-1].startsWith('Notes');}));
  ok('snippet marks the match in <b>',(await page.$eval('#findList .fhit',e=>e.querySelector('b')&&e.querySelector('b').textContent))==='lantern');
  await t.shot('light');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await t.shot('dark');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);

  await openHit();
  ok('opening a result closes the drawer',!(await findOpen()));
  ok('the opened block is in the viewport',await page.evaluate(()=>{const r=[...CSS.highlights.get('find')][0],b=r.startContainer.parentElement.closest('.hp').getBoundingClientRect(),m=r.getBoundingClientRect();return b.bottom>0&&b.top<innerHeight&&m.top>=60&&m.bottom<=innerHeight;}));
  ok('CSS.highlights has "find" on the match',(await marked())==='lantern');
  await t.shot('mark');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await t.shot('mark-dark');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);

  // accent-insensitive; Enter opens the first result before the debounce fires
  await t.openDrawer('#bFind','#find');
  ok('reopening keeps the query and results',(await page.$eval('#findQ',e=>e.value))==='LANTERN'&&await hits()===5);
  await find('tieng viet');
  ok('"tieng viet" finds "Tiếng Việt"',(await text('#findSub'))==='1 match'&&(await text('#findList .fhit b'))==='Tiếng Việt');
  ok('a new search clears the mark',(await marked())===null);
  await setQuery('việt');await page.keyboard.press('Enter');await t.drawersGone();
  ok('Enter opens the first result',!(await findOpen())&&(await marked())==='Việt');

  // a match right after a footnote marker
  await t.openDrawer('#bFind','#find');
  await find('zebra passage');await openHit();
  ok('match after a footnote marker is marked exactly',(await marked())==='zebra passage');

  // the 200-result cap, no matches, Escape
  await t.openDrawer('#bFind','#find');
  await find('the');
  ok('stops at 200 results',(await text('#findSub'))==='200+ matches'&&await hits()===200);
  await find('qqzz');
  ok('no matches',(await text('#findSub'))==='No matches'&&await hits()===0);
  await find('zebra');
  await t.closeDrawer();
  ok('Escape closes the drawer and keeps the query',!(await findOpen())&&(await page.$eval('#findQ',e=>e.value))==='zebra');

  // without the Custom Highlight API the block flashes instead
  await page.evaluate(()=>{CSS.highlights.delete('find');delete window.Highlight;});
  await t.openDrawer('#bFind','#find');await openHit();
  ok('without the Highlight API the block flashes',await page.evaluate(()=>{const f=document.querySelectorAll('#col .hp.found');return f.length===1&&f[0].textContent.includes('zebra passage')&&!CSS.highlights.has('find')&&getComputedStyle(f[0]).animationName==='found';}));

  // another book starts with an empty search
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('.cover[aria-label^="The Quiet Engine"]');await t.reader();
  await t.openDrawer('#bFind','#find');
  ok('another book starts with an empty search',(await page.$eval('#findQ',e=>e.value))===''&&await hits()===0&&(await text('#findSub'))===''&&(await marked())===null);
  await t.closeDrawer();
});
