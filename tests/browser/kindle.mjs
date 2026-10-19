// Kindle notebook exports: import one with the review step, merge a newer export, add several files at once (the
// file picker and drop-anywhere, the latter merging into the open book). Usage: node tests/browser/kindle.mjs [repo dir]
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {start,enterLocalMode} from './lib.mjs';

const t=await start('kindle',8130);
const {page,ok,must,vis,text,until}=t;
const fixture=readFileSync(join(t.repo,'tests/fixtures/kindle-notebook.html'),'utf8');
const file=(name,body)=>{const p=join(t.tmp,name);writeFileSync(p,body);return p;};
// The fixture with the "no chapter" highlight gone (deleted on the Kindle) and a new one at the start of Part Two.
const newHl=(text,loc)=>`<div class="noteHeading">Highlight(<span class="annotation_yellow">yellow</span>) - Storms > Page 19 · Location ${loc}</div><div class="noteText">${text}</div>`;
const newer=fixture.replace(/<div class="noteHeading">\s*Highlight\(<span class="annotation_purple">[\s\S]*?no chapter at all\.\s*<\/div>/,'')
  .replace('Part Two\n</div>','Part Two\n</div>'+newHl('A brand new line from the second read.',290));
const md=(title)=>`# ${title}\n\n`+'Plain words for a plain test book. '.repeat(12);
const toast=s=>until(s=>document.querySelector('#toast').textContent.includes(s),s);
const books=()=>page.$$eval('.book',els=>els.length);
async function pick(...paths){
  if(!(await vis('#shelf'))){await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');}
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  await (await page.$('#file')).uploadFile(...paths);
}

await t.run(async()=>{
  await enterLocalMode(t,must);

  // 1. one export, through the review step
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  ok('drop hint names Kindle notebooks and several files',(await text('#dzHint'))==='PDF, .txt, .md, .html or a Kindle notebook — or drop them here'&&await page.$eval('#file',f=>f.multiple));
  await (await page.$('#file')).uploadFile(file('The Lighthouse Ledger - Notebook.html',fixture));
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));
  const det=await text('#det');
  ok('review step: title, flipped author, highlight count',det.includes('The Lighthouse Ledger (Harbour Tales Book 2)')&&det.includes('Ada Rivers')&&det.includes('7 Kindle highlights')&&det.includes('2 sections'));
  await page.click('#impGo');await t.reader();
  ok('reader opens with every passage highlighted',(await text('#hlCount'))==='7'&&(await page.$$eval('mark.hl',m=>new Set(m.map(x=>x.dataset.h)).size))===7);
  ok('Kindle colors mapped',(await page.$$('mark.hl.c-sun')).length>0&&(await page.$$('mark.hl.c-sky')).length>0&&(await page.$$('mark.hl.c-coral')).length>0&&(await page.$$('mark.hl.c-mint')).length>0);
  ok('Kindle notes on their highlights',(await page.$$eval('mark.hl.noted',m=>new Set(m.map(x=>x.dataset.h)).size))===2);
  ok('parts and chapters are headings',(await page.$$eval('#col .hp',hs=>hs.filter(h=>/^H\d$/.test(h.tagName)).map(h=>h.textContent.trim()).join('|')))==='Part One|The Keeper|Storms|Part Two|Storms');
  await t.shot('reader');
  await page.$eval('#barTitle',e=>e.click()); // hidden at phone widthawait page.waitForSelector('#detM:not(.hidden)');
  await page.type('#dSource','https://example.com/ledger');await page.click('#dSave');must('source link saved',await toast('Details saved'));

  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#nbBtn');await until(()=>document.querySelectorAll('#nbList .hcard').length>0);
  ok('Notebook lists the highlights, first passage first, with the part',(await page.$$eval('#nbList .hcard',c=>c.length))===7&&(await page.$eval('#nbList .hcard',c=>c.textContent)).includes('By the lamp')&&(await page.$eval('#nbList .hcard .sec',c=>c.textContent)).includes('Part One'));
  await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');

  // 2. a newer export merges; the same export again changes nothing
  await pick(file('The Lighthouse Ledger - Notebook (2).html',newer));
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));
  await page.click('#impGo');await t.reader();
  ok('newer export merges: 1 new, 1 gone',await toast('Merged: 1 new highlight · 1 no longer in the notebook')&&(await text('#hlCount'))==='7'&&(await books())===1);
  ok('the new passage is highlighted',(await page.$$eval('mark.hl',m=>m.map(x=>x.textContent).join(' '))).includes('A brand new line from the second read.'));
  await page.$eval('#barTitle',e=>e.click()); // hidden at phone widthawait page.waitForSelector('#detM:not(.hidden)');
  ok('merge keeps what Details set',await page.$eval('#dSource',e=>e.value)==='https://example.com/ledger'&&await page.$eval('#dTitle',e=>e.value)==='The Lighthouse Ledger (Harbour Tales Book 2)');
  await page.click('#detM [data-cancel]');
  await pick(file('again.html',newer));
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));
  await page.click('#impGo');await t.reader();
  ok('the same export again: no new highlights',await toast('No new highlights')&&(await text('#hlCount'))==='7');

  // 3. several files from the picker go straight to the shelf
  const other=fixture.replace('The Lighthouse Ledger (Harbour Tales Book 2)','Another Kindle Book');
  await pick(file('a.md',md('Alpha Book')),file('b.md',md('Beta Book')),file('other.html',other),file('empty.txt',''));
  ok('picker: several files added at once, one toast',await toast("Added 3 books · 1 couldn't be read")&&!(await vis('#importM'))&&(await books())===4);

  // 4. drop-anywhere with the Kindle book open: the merge reloads the reader
  await page.click('.cover[aria-label^="The Lighthouse Ledger"]');await t.reader();
  const third=newer.replace('Part Two\n</div>','Part Two\n</div>'+newHl('One more line, dropped onto the page.',289));
  await page.evaluate((html,mdText)=>{const dt=new DataTransfer();dt.items.add(new File([html],'lighthouse-3.html',{type:'text/html'}));dt.items.add(new File([mdText],'gamma.md',{type:'text/markdown'}));
    window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},third,md('Gamma Book'));
  ok('drop-anywhere: several files, merged into the open book',await toast('Added 1 book · merged 1')&&await until(()=>document.querySelector('#hlCount').textContent==='8')&&(await page.$eval('.hero h1',h=>h.textContent)).includes('Lighthouse'));
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  ok('shelf has five books',(await books())===5);
});
