// Colour meanings: five highlight colours (amber is Kindle's orange), named everywhere by their meaning, which Settings
// renames; grouping by colour in the Notebook, the highlights drawer and the export; a Kindle orange highlight importing
// as amber, and a re-import moving one that came in as coral. Screenshots of the toolbar, the grouped Notebook and
// drawer and Settings at 390×844 and 1280×900, light and dark, go to tests/browser/out/colours/.
// Usage: node tests/browser/colours.mjs [repo dir]
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {start,enterLocalMode,addQuietEngine,sleep} from './lib.mjs';

const t=await start('colours',8145);
const {page,ok,must,vis,text,until}=t;
const outDir=join(dirname(fileURLToPath(import.meta.url)),'out','colours');mkdirSync(outDir,{recursive:true});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hlCount=n=>until(n=>document.querySelector('#hlCount').textContent===n,String(n));
const toast=s=>until(s=>document.querySelector('#toast').textContent.includes(s),s);
const prefs=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:prefs')||'{}'));
// the colour groups in a list: [{head, n, cards: [first words of each card]}]
const groups=sel=>page.$$eval(`${sel} > *`,els=>{const gs=[];els.forEach(e=>{
  if(e.matches('.cgh')) gs.push({head:[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(''),n:+e.querySelector('small').textContent,cards:[]});
  else if(e.matches('.hcard')&&gs.length) gs[gs.length-1].cards.push(e.querySelector('.q').textContent.trim().split(/\s+/).slice(0,3).join(' '));});return gs;});
const heads=gs=>gs.map(g=>`${g.head} ${g.n}`);
// one screenshot per size and theme; prep() redraws the view after each resize
async function shots(label,prep,opts={}){
  for(const [width,height] of [[390,844],[1280,900]]) for(const scheme of ['light','dark']){
    await page.setViewport({width,height,deviceScaleFactor:width<500?2:1});
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:scheme}]);
    if(prep) await prep();
    await page.screenshot({path:join(outDir,`${label}-${width}-${scheme}.png`),...opts});
  }
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
}
const P=n=>`#col > p.hp:nth-of-type(${n})`; // the Quiet Engine's paragraphs: 1 "Most great tools", 2 "Three reasons:", 3 "That is the whole method"
// select on screen, so the toolbar (fixed, next to the selection) is on screen too
const select=async(from,to)=>{await page.$eval(from,e=>e.scrollIntoView({block:'center'}));await t.select(from,to);};

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addQuietEngine(t,must);

  // 1. the toolbar: five swatches named by their meaning, keys 1–5
  ok('reader hint says keys 1–5',(await text('.howto')).includes('keys 1–5')&&(await page.$$('.howto .sw')).length===5);
  await select(P(1));
  const sw=await page.$$eval('#tool .sw',b=>b.map(x=>({c:x.dataset.c,label:x.getAttribute('aria-label'),title:x.title})));
  ok('toolbar has 5 swatches, amber last',same(sw.map(s=>s.c),['sun','mint','coral','sky','amber']));
  ok('swatches are named by their meaning, with their key',same(sw.map(s=>s.label),['Lesser (1)','Other (2)','Facts & words (3)','Important (4)','Quotes (5)'])&&sw.every(s=>s.title===s.label));
  const fits=()=>page.$eval('#tool',e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height<60;});
  ok('toolbar fits a 390 px phone',await fits());
  await page.setViewport({width:360,height:740,deviceScaleFactor:2});await select(P(1));await sleep(400);
  ok('toolbar fits a 360 px phone',await fits());
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await shots('toolbar',async()=>{await select(P(1));await sleep(400);});
  await page.keyboard.press('5');await hlCount(1);
  ok('key 5 makes an amber highlight',(await page.$$(`${P(1)} mark.hl.c-amber`)).length>0);

  // four more: Important, Facts & words, Lesser (key 1, across two list items) and a second Quote
  await select(P(2));await page.click('#tool [data-c="sky"]');await hlCount(2);
  await select('#col > blockquote.hp');await page.click('#tool [data-c="coral"]');await hlCount(3);
  await select('.list .li:nth-child(1)','.list .li:nth-child(2)');await page.keyboard.press('1');await hlCount(4);
  await select(P(3));await page.click('#tool [data-c="amber"]');await hlCount(5);
  must('five highlights in four colours',(await page.$$('mark.hl.c-amber')).length>=2&&(await page.$$('mark.hl.c-sky')).length>0&&(await page.$$('mark.hl.c-coral')).length>0&&(await page.$$('mark.hl.c-sun')).length>0);

  // 2. the drawer: chips in meaning order, then grouped by colour
  await t.openDrawer('#bHl','#drawer');
  ok('drawer chips: meaning order, meaning names',same(await page.$$eval('#drFilters .chip',c=>c.map(x=>x.textContent)),['All 5','Important 1','Facts & words 1','Quotes 2','Lesser 1']));
  ok('drawer groups by book order at first',await vis('#drGroupRow')&&(await page.$eval('#drGroup [data-hg="off"]',b=>b.getAttribute('aria-pressed')))==='true'&&!(await page.$('#drList .cgh')));
  await page.click('#drGroup [data-hg="color"]');
  const dg=await groups('#drList');
  ok('drawer grouped: one section per colour, in meaning order, with counts',same(heads(dg),['Important 1','Facts & words 1','Quotes 2','Lesser 1']));
  ok('drawer grouped: book order inside a colour',same(dg[2].cards,['Most great tools','That is the']));
  ok('the choice is remembered',(await prefs()).hlGroup==='color');
  await shots('drawer',()=>page.waitForFunction(()=>!document.querySelector('#drawer').getAnimations().length));
  await page.click('#drList .hcard .q');await t.drawersGone();
  ok('a grouped card still jumps to its highlight',await page.$eval('mark.hl.c-sky',m=>{const r=m.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));

  // 3. the export: Group by colour, in all three formats
  await t.openDrawer('#bHl','#drawer');await page.click('#expBook');await page.waitForSelector('#expM:not(.hidden)');
  ok('export offers Group by colour, off at first',await vis('#expByColor')&&!(await page.$eval('#expByColor',e=>e.checked)));
  const prevSections=await text('#expPrev');
  await t.afterChange('#expPrev',()=>page.click('#expByColor'));
  const order=(s,hs)=>hs.every((h,i)=>s.indexOf(h)>-1&&(i===0||s.indexOf(hs[i-1])<s.indexOf(h)));
  const fmt=async f=>{if((await page.$eval(`#expFmt [data-f="${f}"]`,b=>b.getAttribute('aria-pressed')))!=='true') await t.afterChange('#expPrev',()=>page.click(`#expFmt [data-f="${f}"]`));return text('#expPrev');};
  ok('Markdown grouped by colour: meaning headings in order',order(await fmt('md'),['## Important','## Facts & words','## Quotes','## Lesser'])&&!(await text('#expPrev')).includes('Why small things win'));
  ok('HTML grouped by colour: headings with a swatch',order(await fmt('html'),['</i>Important</h2>','</i>Facts &amp; words</h2>','</i>Quotes</h2>','</i>Lesser</h2>']));
  ok('Plain text grouped by colour',order(await fmt('txt'),['— Important','— Facts & words','— Quotes','— Lesser']));
  ok('Group by colour is remembered',(await prefs()).exByColor===true);
  await fmt('md');await t.afterChange('#expPrev',()=>page.click('#expByColor'));
  ok('unticked: section headings again',(await text('#expPrev'))===prevSections&&prevSections.includes('## 2. Why small things win'));
  await page.click('#expByColor');await page.keyboard.press('Escape');

  // 4. Settings → Colour meanings: rename Quotes, blank Other (back to its default)
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  const fields=()=>page.$$eval('#sMeanings input',i=>i.map(x=>`${x.dataset.c}:${x.value}`));
  ok('Settings lists the meanings in order, with their defaults',same(await fields(),['sky:Important','coral:Facts & words','amber:Quotes','sun:Lesser','mint:Other']));
  ok('each meaning has its swatch',(await page.$$eval('#sMeanings .cm i',i=>i.map(x=>x.style.background))).join()==='var(--skyS),var(--coralS),var(--amberS),var(--sunS),var(--mintS)');
  await shots('settings',()=>page.$eval('#sMeanings',e=>e.scrollIntoView({block:'center'})));
  const type=(c,v)=>page.$eval(`#sMeanings [data-c="${c}"]`,(e,v)=>{e.value=v;},v);
  await type('amber','  Favourite   lines ');await type('mint','');
  await page.click('#sSave');
  ok('saving renames',await toast('Settings saved')&&!(await vis('#setM')));
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden)',{timeout:10000});
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  ok('the new name is kept after a reload; a blank one is the default',same(await fields(),['sky:Important','coral:Facts & words','amber:Favourite lines','sun:Lesser','mint:Other']));
  await page.keyboard.press('Escape');

  // 5. the Notebook: renamed chip, grouped by colour (the drawer's choice), newest first inside a colour
  await page.click('#nbBtn');await page.waitForSelector('#nbList .hcard',{timeout:5000});
  ok('Notebook chips use the new name',same(await page.$$eval('#nbChips .chip',c=>c.map(x=>x.textContent)),['All 5','Important 1','Facts & words 1','Favourite lines 2','Lesser 1']));
  ok('Notebook opens grouped by colour, as the drawer was left',(await page.$eval('#nbGroup [data-hg="color"]',b=>b.getAttribute('aria-pressed')))==='true');
  const ng=await groups('#nbList');
  ok('Notebook grouped: sections in meaning order with counts',same(heads(ng),['Important 1','Facts & words 1','Favourite lines 2','Lesser 1']));
  ok('Notebook grouped: newest first inside a colour',same(ng[2].cards,['That is the','Most great tools']));
  ok('no horizontal scroll at phone width',await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
  await shots('notebook',null,{fullPage:true});
  await page.click('#nbChips [data-f="amber"]');
  ok('a colour chip leaves one section',same(heads(await groups('#nbList')),['Favourite lines 2']));
  await page.click('#nbChips [data-f="all"]');
  await page.click('#nbGroup [data-hg="off"]');
  ok('Newest: no sections, newest first',!(await page.$('#nbList .cgh'))&&(await page.$$eval('#nbList .hcard',c=>c.length))===5&&(await prefs()).hlGroup==='off'&&(await page.$eval('#nbList .hcard .q',q=>q.textContent)).startsWith('That is the'));
  await page.click('#nbGroup [data-hg="color"]');
  await page.click('#nbExp');await page.waitForSelector('#expM:not(.hidden)');
  await until(()=>document.querySelector('#expPrev').textContent.includes('Favourite lines'));
  ok('the export uses the new name (whole shelf, grouped)',(await page.$eval('#expByColor',e=>e.checked))&&order(await text('#expPrev'),['### Important','### Facts & words','### Favourite lines','### Lesser']));
  await page.click('#expByColor');await page.keyboard.press('Escape');

  // 6. the toolbar on an existing highlight uses the new name
  await page.click('#nbList .hcard');await t.reader();
  await page.click('mark.hl.c-amber');await until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  ok('toolbar names the renamed colour',(await page.$eval('#tool [data-c="amber"]',b=>b.getAttribute('aria-label')))==='Favourite lines (5)'&&(await page.$eval('#tool [data-c="amber"]',b=>b.classList.contains('on'))));
  await page.keyboard.press('Escape');

  // 7. Kindle: orange imports as amber; a re-import moves one that came in as coral
  const kpath=join(t.tmp,'The Lighthouse Ledger - Notebook.html');writeFileSync(kpath,readFileSync(join(t.repo,'tests/fixtures/kindle-notebook.html'),'utf8'));
  const importKindle=async()=>{
    if(!(await vis('#shelf'))){await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');}
    await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
    await (await page.$('#file')).uploadFile(kpath);
    await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));
    await page.click('#impGo');await t.reader();
  };
  const colourOf=start=>page.$$eval('mark.hl',(ms,start)=>{const m=ms.find(x=>x.closest('.hp').textContent.startsWith(start));return m?[...m.classList].find(c=>c.startsWith('c-')):null;},start);
  await importKindle();
  ok('Kindle orange imports as amber; pink as coral',(await colourOf('Ships & sailors'))==='c-amber'&&(await colourOf('squall'))==='c-coral');
  await page.$eval('mark.hl.c-amber',m=>m.scrollIntoView({block:'center'}));
  await page.click('mark.hl.c-amber');await until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.click('#tool [data-c="coral"]');
  must('recoloured to coral, as an older import left it',await until(()=>[...document.querySelectorAll('mark.hl.c-coral')].some(m=>m.closest('.hp').textContent.startsWith('Ships'))));
  await importKindle();
  ok('re-import moves it to amber and says so',await toast('Merged: 0 new highlights · 1 moved to Favourite lines')&&(await colourOf('Ships & sailors'))==='c-amber'&&(await colourOf('squall'))==='c-coral'&&(await text('#hlCount'))==='7');
});
