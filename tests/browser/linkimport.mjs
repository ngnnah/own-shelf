// Link import's article extraction, as the app runs it on a page the Worker fetched: parse, lift article headers,
// Readability, htmlToBlocks. Usage: node tests/browser/linkimport.mjs [repo dir]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {start} from './lib.mjs';

const t=await start('linkimport',8150);
const {page,ok,must,until}=t;
const fixture=readFileSync(join(t.repo,'tests/fixtures/article-header-summary.html'),'utf8');
const SUMMARY='A made-up summary in a highlighted box';
// The article's paragraphs, with or without lifting its <header> first.
const texts=lift=>page.evaluate((html,lift)=>{
  const doc=new DOMParser().parseFromString(html,'text/html');
  if(lift) liftArticleHeaders(doc);
  return htmlToBlocks(new Readability(doc).parse().content).filter(b=>b.text).map(b=>b.text);
},fixture,lift);

await t.run(async()=>{
  await page.goto(t.base,{waitUntil:'networkidle0'});
  must('Readability and parse.js loaded',await until(()=>window.Readability&&window.htmlToBlocks));
  ok('the fixture shows the problem: Readability alone drops the summary in the article header',!(await texts(false)).some(s=>s.startsWith(SUMMARY)));
  must('liftArticleHeaders exists',await page.evaluate(()=>typeof window.liftArticleHeaders==='function'));
  const got=await texts(true);
  ok('with the header lifted, the summary opens the article',!!got[0]&&got[0].startsWith(SUMMARY));
  ok('every note follows',got.length===19&&got[1].startsWith('The harbour town')&&got[18].startsWith('The lighthouse keeper'));
  ok('the title and the short meta lines stay out',!got.some(s=>/Harbour Manners|ISBN|recommend it|date read/.test(s)));
});
