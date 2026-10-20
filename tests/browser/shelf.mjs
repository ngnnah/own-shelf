// Arranging the shelf by title, and picking a cover colour in Details. Usage: node tests/browser/shelf.mjs [repo dir]
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {start,enterLocalMode,addMarkdown} from './lib.mjs';

const t=await start('shelf',8131);
const {page,ok,must,vis,text,until}=t;
const md=title=>`# ${title}\n\n`+'Plain words for a plain test book on the shelf. '.repeat(10);
const home=async()=>{await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');};
const labels=()=>page.$$eval('.shelf-label',ls=>ls.map(l=>l.firstChild.textContent.trim()));
const titles=()=>page.$$eval('.shelf-row .c-t',ts=>ts.map(x=>x.textContent));
const details=async title=>{await page.$$eval('.book',(bs,tt)=>bs.find(b=>b.querySelector('.c-t').textContent===tt).querySelector('.c-more').click(),title);await page.waitForSelector('#detM:not(.hidden)');};
const bindingOf=title=>page.$$eval('.cover',(cs,tt)=>{const c=cs.find(x=>x.querySelector('.c-t').textContent===tt);return c.style.getPropertyValue('--bc');},title);

await t.run(async()=>{
  await enterLocalMode(t,must);
  for(const [f,title] of [['z.md','The Zebra Book'],['a.md','apple notes'],['anh.md','Ánh trăng'],['n.md','42 Ways']]){await addMarkdown(t,f,md(title),title);await home();}

  // Arrange by → Title
  await page.click('#segGroup [data-g="title"]');
  ok('Arrange by has Title, and it is selected',(await page.$eval('#segGroup [data-g="title"]',b=>b.getAttribute('aria-pressed')))==='true');
  ok('shelved by first letter: A, Z, then # for the rest',(await labels()).join('|')==='A|Z|#');
  ok('"The" and accents are ignored; titles in order within a letter',(await titles()).join('|')==='Ánh trăng|apple notes|The Zebra Book|42 Ways');
  ok('the controls fit a phone screen',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await t.shot('by-title');
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden)');
  ok('the choice is remembered',(await labels()).join('|')==='A|Z|#');

  // the List view sorts the same way
  await page.click('#segView [data-v="list"]');await page.click('#segGroup [data-g="title"]');
  ok('List view: Title sorts the same way',(await page.$$eval('.tbl .tt',r=>r.map(x=>x.textContent).join('|')))==='42 Ways|Ánh trăng|apple notes|The Zebra Book');
  await page.click('#segView [data-v="shelves"]');

  // Details → Cover
  const before=await bindingOf('The Zebra Book');
  await details('The Zebra Book');
  ok('Details offers the eight bindings, the current one pressed',(await page.$$('#dCover .cv-sw')).length===8&&(await page.$$('#dCover [aria-pressed="true"]')).length===1&&
    (await page.$eval('#dCover [aria-pressed="true"]',b=>b.style.getPropertyValue('--c')))===before);
  await t.shot('details-cover');
  const teal=await page.$eval('#dCover [aria-label="Teal"]',b=>b.style.getPropertyValue('--c'));
  await page.click(before===teal?'#dCover [aria-label="Navy"]':'#dCover [aria-label="Teal"]');
  const want=await page.$eval('#dCover [aria-pressed="true"]',b=>b.style.getPropertyValue('--c'));
  await page.click('#dSave');await until(()=>document.querySelector('#detM').classList.contains('hidden'));
  ok('Save recolours the cover',(await bindingOf('The Zebra Book'))===want&&want!==before);
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden)');
  ok('the colour is kept',(await bindingOf('The Zebra Book'))===want);
  await details('The Zebra Book');
  ok('Details shows the picked colour',(await page.$eval('#dCover [aria-pressed="true"]',b=>b.style.getPropertyValue('--c')))===want);
  await page.click('#detM [data-cancel]');await until(()=>document.querySelector('#detM').classList.contains('hidden'));

  // a Kindle notebook keeps its ruled cover: no picker
  const k=join(t.tmp,'k.html');writeFileSync(k,readFileSync(join(t.repo,'tests/fixtures/kindle-notebook.html'),'utf8'));
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');await (await page.$('#file')).uploadFile(k);
  await until(()=>document.querySelector('#det').textContent.includes('Kindle highlights'));await page.click('#impGo');await t.reader();await home();
  await details('The Lighthouse Ledger (Harbour Tales Book 2)');
  ok('no cover picker for a Kindle notebook',!(await vis('#dCoverRow')));
});
