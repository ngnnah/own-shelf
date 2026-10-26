// The page never scrolls sideways on a phone: on every screen and in every state, at 375 px with a touch screen (and
// at 320 px for the shelf, the reader and the Words tab), nothing in the page is wider than the screen, no drawer or dialog scrolls
// sideways inside, and the fixed bar, toolbar, cards, toast, drawers and dialogs stay inside the screen (with the
// Date written quick picks in Add and Book details, the byline's pencil, every arrangement including by Shelf, the shelf
// dialog, a shelf name without spaces, every shelf collapsed and the New shelf and Collapse all buttons, at both widths).
// The books:
// the rich paste; a stress paste (a 300-character unbroken link in a paragraph, a list item, a quote, a caption, a
// footnote and a note; long words in headings; a wide table; a long code line; a wide picture; a pull quote); a
// Kindle notebook (its contents list chapters); a book whose title and author have no spaces.
// The page measures with the html/body overflow-x:clip backstop turned off, so the checks test each cause; then the
// backstop itself, and what it must not break: the window scrolls, the bar stays fixed, Study's sticky buttons.
// Clicks are DOM clicks: a page wider than the screen widens Chrome's layout viewport and real clicks miss.
// Dictionaries are mocked. Usage: node tests/browser/overflow.mjs [repo dir]
// Screenshots (the stress book and the Kindle contents at 320 px, the Notebook and the List view) go to
// tests/browser/out/overflow/.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {start,sleep,pasteHtml,richPaste} from './lib.mjs';

const t=await start('overflow',8154);
const {page,ok,must,vis,until}=t;
const shots=join(dirname(fileURLToPath(import.meta.url)),'out','overflow');mkdirSync(shots,{recursive:true});

/* ---------- the dictionaries, mocked ---------- */
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
const json=(req,status,body)=>req.respond({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
page.on('request',req=>{
  const u=new URL(req.url());
  if(u.hostname==='api.datamuse.com') return json(req,200,[{word:u.searchParams.get('sp'),defs:['adj\tOf great length.']}]);
  if(u.hostname==='en.wiktionary.org'||u.hostname==='en.wikipedia.org') return json(req,404,{});
  req.continue();
});

/* ---------- the books ---------- */
const URL300='https://example.com/'+'averyverylongpathsegment'.repeat(12).slice(0,280);
const WORD='Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(2);
const filler=n=>'Plain words in a plain sentence for the body of the test. '.repeat(n);
const STRESS=`<h1>Overflow Stress Test</h1><p>By Wren Margin</p><p>May 1, 2024</p>
<p>${filler(8)}</p>
<h2>${WORD} heading</h2>
<p>See <a href="${URL300}">${URL300}</a> for the details.</p>
<p>A bare link ${URL300} in the text, then <code>${'a_long_identifier_'.repeat(10)}</code> in code.</p>
<table><tr>${Array.from({length:10},(_,i)=>`<th>Column${i}heading</th>`).join('')}</tr><tr>${Array.from({length:10},(_,i)=>`<td>cell${i}valuewithoutspaces</td>`).join('')}</tr></table>
<pre>const result = ${'someVeryLongFunctionName'.repeat(12)}();</pre>
<blockquote><p>A quote with ${URL300}</p></blockquote>
<ul><li>A list item with ${URL300}</li><li>A short item</li></ul>
<figure><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/1280px-Camponotus_flavomarginatus_ant.jpg" width="1280" height="880" alt="a wide picture"><figcaption>A caption with ${URL300}</figcaption></figure>
<p>Take the long road when the short one is crowded with people. ${filler(3)}</p>
<h3>${WORD}</h3>
<p>${filler(6)} A claim that needs a source [1].</p>
<p>${filler(10)}</p>
<p>Notes</p><p>[1] The source: ${URL300}</p>`;
const LONGTITLE='Harbour_Committee_Minutes_2024_final_version_two_with_every_appendix_attached';
const LONGAUTHOR='harbour.committee.secretary.office@example.org';
const LONGBOOK=`<h1>${LONGTITLE}</h1><p>By ${LONGAUTHOR}</p><p>${filler(12)}</p><p>${filler(12)}</p>`;
const SHELFNAME='Harbour_Committee_Minutes_and_Appendices';
const MEANING=Array.from({length:30},(_,i)=>`${i+1}. A meaning on a line of its own, long enough to need scrolling.`).join('\n');

/* ---------- helpers ---------- */
const clk=sel=>page.$eval(sel,e=>e.click());
const shown=sel=>page.waitForSelector(sel+':not(.hidden)',{timeout:8000});
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
const phone=w=>page.setViewport({width:w,height:780,deviceScaleFactor:2,isMobile:true,hasTouch:true});
async function home(){
  if(await vis('#shelf')) return;
  await clk(await vis('#notebook')?'#nbBack':await vis('#study')?'#syBack':'#bHome');await shown('#shelf');
}
async function openBook(title){await home();await clk(`.cover[aria-label^="${title}"]`);await t.reader();}
async function add(html,title){
  await home();await clk('#addBtn');await shown('#importM');await pasteHtml(page,html,'x');
  await until(s=>document.querySelector('#det').textContent.includes(s),title.slice(0,20));await clk('#impGo');await t.reader();
}
// Select the start (n characters) or all of the first element matching sel, then wait for the toolbar.
async function select(sel,n=0){
  await page.evaluate((s,n)=>{const el=document.querySelector(s);el.scrollIntoView({block:'center'});
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),a=w.nextNode();let z=a,x;while((x=w.nextNode()))z=x;
    const r=document.createRange();r.setStart(a,0);if(n)r.setEnd(a,Math.min(n,a.length));else r.setEnd(z,z.length);
    getSelection().removeAllRanges();getSelection().addRange(r);},sel,n);
  return until(()=>!document.querySelector('#tool').classList.contains('hidden'));
}
const firstP=start=>page.evaluate(s=>[...document.querySelectorAll('#col p.hp')].findIndex(p=>p.textContent.startsWith(s))+1,start).then(i=>`#col p.hp:nth-of-type(${i})`);
async function drawer(btn,id){await clk(btn);await page.waitForFunction(id=>{const d=document.querySelector(id);return d.classList.contains('open')&&!d.getAnimations().length;},{timeout:5000},id);}
async function closeDrawers(){await page.keyboard.press('Escape');await t.drawersGone();}

// With the backstop off: is the page wider than the screen, does a drawer, dialog or card scroll sideways inside,
// and does a fixed bar, card, toast, drawer or dialog pass the screen's edge? Names the culprits.
const measure=()=>page.evaluate(()=>{
  const off=document.createElement('style');off.textContent='html,body{overflow-x:visible!important}';document.head.append(off);
  const de=document.documentElement,cw=de.clientWidth,sw=de.scrollWidth;
  const name=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.classList.length?'.'+[...e.classList].join('.'):'');
  const shows=e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'&&e.getClientRects().length;};
  const past=e=>{const r=e.getBoundingClientRect();return r.right>cw+.5||r.left<-.5;};
  // the culprits: elements in the page whose box or content passes the right edge, innermost first
  const wide=sw>cw?[...document.body.querySelectorAll('*')].filter(e=>shows(e)&&getComputedStyle(e).position!=='fixed'&&!e.closest('.drawer,.modal,#tool,#noteBox,#wordBox,#toast,#bar')&&
    (past(e)||e.getBoundingClientRect().left+e.scrollWidth>cw+.5)&&!e.querySelector('*:not(br)')).slice(0,4).map(name):[];
  const inner=[...document.querySelectorAll('.dr-list,.dlg,#noteBox,#wordBox,#wbBody,#wbMore')].filter(e=>shows(e)&&e.scrollWidth>e.clientWidth+1).map(name);
  const fixed=[...document.querySelectorAll('#bar .bar-in>*,#tool,#noteBox,#wordBox,#toast.on,.drawer.open,.modal .dlg')].filter(e=>shows(e)&&past(e)).map(name);
  off.remove();
  return {cw,sw,wide,inner,fixed};
});
async function fits(label){
  await sleep(120);const m=await measure();
  const good=m.sw<=m.cw&&!m.inner.length&&!m.fixed.length;
  ok(`${m.cw} px, ${label}: nothing passes the screen's edge`,good);
  if(!good) console.log(`     page ${m.sw} px wide${m.wide.length?' ('+m.wide.join(', ')+')':''}${m.inner.length?'; scrolls inside: '+m.inner.join(', '):''}${m.fixed.length?'; fixed past the edge: '+m.fixed.join(', '):''}`);
}
// Every shown element matching sel (at least one) lies inside the screen and inside its box (box: a selector for
// the nearest ancestor that holds it, e.g. the dialog).
const inside=(label,sel,box)=>page.evaluate((sel,box)=>{
  const cw=document.documentElement.clientWidth,es=[...document.querySelectorAll(sel)].filter(e=>e.getClientRects().length);
  return es.length>0&&es.every(e=>{const r=e.getBoundingClientRect(),b=box?e.closest(box).getBoundingClientRect():{left:0,right:cw};return r.left>=Math.max(0,b.left)-.5&&r.right<=Math.min(cw,b.right)+.5;});
},sel,box).then(good=>ok(`${label} inside the screen`,good));

/* ---------- the screens ---------- */
async function shelf(){
  await home();
  for(const v of ['shelves','list']){
    await clk(`#segView [data-v="${v}"]`);
    for(const g of ['shelf','added','written','author','title']){await clk(`#segGroup [data-g="${g}"]`);await fits(`shelf, ${v==='list'?'List':'Shelves'} by ${g}`);}
  }
  // Arrange by Shelf: the shelf dialog, and a shelf whose name has no spaces (40 characters, the most a name takes)
  await clk('#segView [data-v="shelves"]');await clk('#segGroup [data-g="shelf"]');
  await clk('#shTools [data-shelf-new]');await shown('#shelfM');await fits('the New shelf dialog');
  await page.$eval('#shName',(e,v)=>{e.value=v;},SHELFNAME);await clk('#shSave');await hidden('#shelfM');
  await fits('shelf, a shelf named without spaces');
  // every shelf collapsed to a strip, that one too; New shelf and Expand all at the top
  const w=await page.evaluate(()=>document.documentElement.clientWidth);
  await clk('#foldAll');await fits('shelf, every shelf collapsed');
  await inside(`${w} px, shelf: New shelf and Expand all`,'#shTools button');
  await clk('#foldAll');
  const sid=await page.$$eval('#shelfBody .sl-name',(bs,n)=>bs.find(b=>b.textContent===n).dataset.shelfEdit,SHELFNAME);
  await clk(`#shelfBody [data-shelf-edit="${sid}"]`);await shown('#shelfM');await fits('the shelf dialog (rename, move or delete)');
  await clk('#shDel');await clk('#shDel');await hidden('#shelfM');
  await clk('#segGroup [data-g="added"]');
}
async function reader(){
  for(const b of ['The Quiet Engine','Overflow Stress Test','The Lighthouse Ledger',LONGTITLE]){
    await openBook(b);await page.evaluate(()=>scrollTo(0,0));await fits(`reader, ${b.slice(0,24)}, top`);
    await inside(`${await page.evaluate(()=>document.documentElement.clientWidth)} px, reader, ${b.slice(0,24)}: the byline's pencil`,'.hero .byline .ed');
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await fits(`reader, ${b.slice(0,24)}, end`);
  }
  await openBook('Overflow Stress Test');
  await page.evaluate(()=>{const f=document.querySelector('.fn');f.scrollIntoView({block:'center'});f.click();});
  await fits('reader, footnote open');
  while(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--fs'))!=='1.38rem') await clk('#bSize');
  await fits('reader, largest text');
  for(const [b,id] of [['#bToc','#toc'],['#bHl','#drawer'],['#bFind','#find']]){
    await drawer(b,id);if(id==='#find'){await page.type('#findQ','averyvery');await sleep(500);}
    await fits(`reader, ${id} drawer open`);await closeDrawers();await fits(`reader, ${id} drawer closed`);
  }
  while(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--fs'))!=='1.22rem') await clk('#bSize');
}
async function readerStates(){
  await openBook('Overflow Stress Test');
  await select('#col p.hp',30);await fits('highlight toolbar');
  await clk('#tool [data-a="note"]');await shown('#noteBox');await page.$eval('#noteTa',(e,v)=>{e.value=v;},'A note: '+URL300);await fits('note box');
  await clk('#noteCancel');await hidden('#noteBox');
  await select(await firstP('Take the long road'),4);await clk('#tool [data-a="word"]');await shown('#wordBox');await sleep(400);await fits('word card');
  await clk('#wbClose');await hidden('#wordBox');
  await select('#col p.hp',30);await clk('#tool [data-c="sun"]');await until(()=>document.querySelector('#toast').classList.contains('on'));await fits('toast');
  await drawer('#bHl','#drawer');await clk('#clearAll');await shown('#confirmM');await fits('typed-yes confirm');
  await clk('#confirmM [data-cancel]');await hidden('#confirmM');
  await clk('#expBook');await shown('#expM');await fits('Export (this book)');await clk('#expM [data-cancel]');await hidden('#expM');await closeDrawers();
  await clk('#barTitle');await shown('#detM');await fits('Book details, from the reader');await clk('#detM [data-cancel]');await hidden('#detM');
  await openBook(LONGTITLE);
  await drawer('#bHl','#drawer');await clk('#clearAll');await shown('#confirmM');await fits('typed-yes confirm naming an unbroken title');
  await clk('#confirmM [data-cancel]');await hidden('#confirmM');await closeDrawers();
}
// The Add and Book details dialogs, with the Date written quick picks (.dq); at 375 px also the rest
async function dialogs(all=true){
  await home();const w=await page.evaluate(()=>document.documentElement.clientWidth);
  await clk('#addBtn');await shown('#importM');await fits('Add');
  await inside(`${w} px, Add: the Date written quick picks`,'#importM .dq .chip','.dlg');
  await pasteHtml(page,STRESS,'x');await until(()=>document.querySelector('#det').textContent.includes('Wren'));await fits('Add, the stress paste');
  await pasteHtml(page,LONGBOOK,'x');await until(t=>document.querySelector('#det').textContent.includes(t),LONGTITLE.slice(0,20));await fits('Add, an unbroken title');
  await inside(`${w} px, Add with an unbroken title: the Date written quick picks`,'#importM .dq .chip','.dlg');
  await clk('#importM [data-cancel]');await hidden('#importM');
  await page.$$eval('.book',(bs,tt)=>bs.find(b=>b.querySelector('.c-t').textContent===tt).querySelector('.c-more').click(),LONGTITLE);await shown('#detM');
  await fits('Book details');
  await inside(`${w} px, Book details: the Date written quick picks`,'#detM .dq .chip','.dlg');
  if(!all){await clk('#detM [data-cancel]');await hidden('#detM');return;}
  await clk('#dRemove');await shown('#confirmM');await fits('removing a book: the typed-yes confirm');
  await clk('#confirmM [data-cancel]');await hidden('#confirmM');await clk('#detM [data-cancel]');await hidden('#detM');
  await clk('#setBtn');await shown('#setM');await fits('Settings');
  await clk('#trashBtn');await shown('#trashM');await fits('Trash');await clk('#trashM [data-cancel]');await hidden('#trashM');
  await clk('#setM [data-cancel]');await hidden('#setM');
}
async function notebook(){
  await home();await clk('#nbBtn');await shown('#notebook');await fits('Notebook, Highlights');
  await clk('#nbGroup [data-hg="color"]');await fits('Notebook, Highlights by colour');await clk('#nbGroup [data-hg="off"]');
  await clk('#nbExp');await shown('#expM');await fits('Export (whole shelf)');await clk('#expM [data-cancel]');await hidden('#expM');
  await page.screenshot({path:join(shots,'notebook-375.png')});
  await clk('#nbTabWd');await until(()=>document.querySelectorAll('#wdList .wcard').length>0);await fits('Notebook, Words');
  if(!(await page.$eval('#wpMore',d=>d.open))) await clk('#wpMore>summary');await fits('Notebook, Words, the Progress panel’s Reviews by day open');
  await clk('#wdChips [data-f="sort"]');await until(()=>document.querySelector('#wdList .scard'));await fits('Notebook, To sort');
  await clk('#wdChips [data-f="all"]');await clk('#nbTabHl');
}

await t.run(async()=>{
  await phone(375);
  await page.goto(t.base,{waitUntil:'networkidle0'});await page.waitForSelector('#signin:not(.hidden)',{timeout:15000});
  await fits('sign-in');
  await clk('#siLocal');await shown('#shelf');await fits('the empty shelf');

  // the books, a word with a long meaning, and highlights: mint, To sort (coral), a long link with a long note, amber
  await add(richPaste(),'The Quiet Engine');
  await select('#col p.hp');await clk('#tool [data-c="mint"]');
  await add(LONGBOOK,LONGTITLE);
  await select('#col p.hp',40);await clk('#tool [data-c="amber"]');
  await add(STRESS,'Overflow Stress Test');
  await select(await firstP('Take the long road'),4);await clk('#tool [data-a="word"]');await shown('#wordBox');await sleep(400);
  await page.$eval('#wbDef',(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},MEANING);await clk('#wbSave');await hidden('#wordBox');
  await select('#col blockquote.hp');await clk('#tool [data-c="coral"]');
  await select(await firstP('See https'));await clk('#tool [data-a="note"]');await shown('#noteBox');
  await page.$eval('#noteTa',(e,v)=>{e.value=v;},'A note: '+URL300);await clk('#noteSave');await hidden('#noteBox');
  await home();const kp=join(t.tmp,'The Lighthouse Ledger - Notebook.html');writeFileSync(kp,readFileSync(join(t.repo,'tests/fixtures/kindle-notebook.html'),'utf8'));
  await clk('#addBtn');await shown('#importM');await (await page.$('#file')).uploadFile(kp);
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));await clk('#impGo');await t.reader();
  must('four books on the shelf',await (async()=>{await home();return (await page.$$('.book')).length===4;})());

  // 375 px: every screen
  await shelf();
  await clk('#segView [data-v="list"]');await page.screenshot({path:join(shots,'list-375.png'),fullPage:true});await clk('#segView [data-v="shelves"]');
  await dialogs();
  await notebook();
  await page.goto(t.base+'?study=1',{waitUntil:'networkidle0'});await shown('#study');await fits('Study, the front');
  await clk('#syActs [data-sy="show"]');await until(()=>document.querySelector('#syActs .sy-rate'));await fits('Study, the back');
  // the backstop doesn't break sticky: the long card scrolls under Study's buttons, which stay at the bottom
  const sticky=await page.evaluate(()=>{const a=document.querySelector('#syActs').getBoundingClientRect();return {long:document.documentElement.scrollHeight>innerHeight+200,bottom:a.bottom,top:a.top,h:innerHeight};});
  ok("Study: a long card scrolls, and the rating buttons stick to the bottom of the screen",sticky.long&&sticky.bottom<=sticky.h+.5&&sticky.top<sticky.h);
  await clk('#syBack');await shown('#shelf');
  await reader();
  await readerStates();

  // the backstop: html and body clip sideways (clip, not hidden: body stays out of scrolling, so sticky and the
  // window's scroll work); something too wide still can't scroll the page; the window scrolls, the bar stays put
  await openBook('Overflow Stress Test');
  const back=await page.evaluate(()=>{const h=getComputedStyle(document.documentElement),b=getComputedStyle(document.body);return [h.overflowX,b.overflowX,b.overflowY].join(' ');});
  ok('html and body clip sideways, and body still overflows downwards (not a scroll container)',back==='clip clip visible');
  const held=await page.evaluate(()=>{const d=document.createElement('div');d.style.cssText='width:2000px;height:4px';document.querySelector('#col').append(d);
    scrollTo(500,1500);const r={sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth,x:scrollX,y:scrollY,bar:document.querySelector('#bar').getBoundingClientRect().top};d.remove();return r;});
  ok('something too wide still leaves the page as wide as the screen, and it can’t be scrolled sideways',held.sw===held.cw&&held.x===0);
  ok('the window still scrolls down, and the reader bar stays at the top',held.y>1000&&held.bar===0);
  await page.evaluate(()=>scrollTo(0,0));
  // iOS zooms into a focused field under 16 px, and the zoomed page pans sideways
  const small=await page.evaluate(()=>[...document.querySelectorAll('input,textarea,select,[contenteditable]')].filter(e=>!/^(checkbox|radio|file|hidden)$/.test(e.type)&&parseFloat(getComputedStyle(e).fontSize)<16).map(e=>e.id||e.className));
  ok('every text field and menu is at least 16 px on a touch screen',!small.length);if(small.length)console.log('     under 16 px: '+small.join(', '));

  // 320 px: the shelf and the reader
  await phone(320);await page.goto(t.base,{waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');
  await shelf();
  await dialogs(false);
  await clk('#nbBtn');await shown('#notebook');await clk('#nbTabWd');await until(()=>document.querySelectorAll('#wdList .wcard').length>0);
  await fits('Notebook, Words with the Progress panel');await clk('#nbTabHl');
  await reader();
  await openBook('Overflow Stress Test');await select('#col p.hp',30);await fits('highlight toolbar');
  await page.evaluate(()=>getSelection().removeAllRanges());
  await page.evaluate(()=>document.querySelector('#col mark.hl').click());await until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await fits('highlight toolbar for a highlight (Edit note, Remove)');
  ok('320 px: the docked toolbar keeps "Edit note" on one line, inside the screen',await page.evaluate(()=>{const n=document.querySelector('#tool [data-a="note"]'),was=n.textContent;n.textContent='Edit note';
    const h=[...document.querySelectorAll('#tool .tb')].map(b=>b.getBoundingClientRect().height),r=document.querySelector('#tool').getBoundingClientRect();n.textContent=was;
    return Math.max(...h)-Math.min(...h)<4&&r.left>=0&&r.right<=document.documentElement.clientWidth;}));
  ok('320 px: the reader bar fits a three-digit highlight count',await page.evaluate(()=>{const b=document.querySelector('#hlCount'),was=b.textContent;b.textContent='999';
    const fit=[...document.querySelectorAll('#bar .bar-in>*')].every(e=>e.getBoundingClientRect().right<=document.documentElement.clientWidth);b.textContent=was;return fit;}));
  await page.keyboard.press('Escape');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(shots,'stress-320.png'),fullPage:true});
  await openBook('The Lighthouse Ledger');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(shots,'kindle-contents-320.png')});
  await home();await clk('#segView [data-v="list"]');await page.screenshot({path:join(shots,'list-320.png'),fullPage:true});await clk('#segView [data-v="shelves"]');
});
