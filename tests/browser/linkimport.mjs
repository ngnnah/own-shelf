// Link import's article extraction, as the app runs it on a page the Worker fetched: parse, lift article headers,
// mark bare wrappers, Readability, htmlToBlocks. Usage: node tests/browser/linkimport.mjs [repo dir]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {start} from './lib.mjs';

const t=await start('linkimport',8150);
const {page,ok,must,until}=t;
const fixture=name=>readFileSync(join(t.repo,'tests/fixtures',name),'utf8');
const header=fixture('article-header-summary.html'),chunked=fixture('chunked-article-intro.html');
const SUMMARY='A made-up summary in a highlighted box';
const INTRO=['How much do you know about fog nets?','Maybe, like me, you have seen a photo'];
// The article's paragraphs after the given clean-up steps (parse.js globals), in order.
const texts=(html,steps)=>page.evaluate((html,steps)=>{
  const doc=new DOMParser().parseFromString(html,'text/html');
  steps.forEach(s=>window[s](doc));
  return htmlToBlocks(new Readability(doc).parse().content).filter(b=>b.text).map(b=>b.text);
},html,steps);
const ALL=['liftArticleHeaders','markBareWrappers'];

await t.run(async()=>{
  await page.goto(t.base,{waitUntil:'networkidle0'});
  must('Readability and parse.js loaded',await until(()=>window.Readability&&window.htmlToBlocks));
  ok('the fixture shows the problem: Readability alone drops the summary in the article header',!(await texts(header,[])).some(s=>s.startsWith(SUMMARY)));
  must('liftArticleHeaders exists',await page.evaluate(()=>typeof window.liftArticleHeaders==='function'));
  const got=await texts(header,['liftArticleHeaders']);
  ok('with the header lifted, the summary opens the article',!!got[0]&&got[0].startsWith(SUMMARY));
  ok('every note follows',got.length===19&&got[1].startsWith('The harbour town')&&got[18].startsWith('The lighthouse keeper'));
  ok('the title and the short meta lines stay out',!got.some(s=>/Harbour Manners|ISBN|recommend it|date read/.test(s)));
  ok('marking bare wrappers too changes nothing on that page',JSON.stringify(await texts(header,ALL))===JSON.stringify(got));

  // An article in chunks, each in a bare <div>, beside an "Executive summary" toggle (MIT Technology Review, 2026)
  must('markBareWrappers exists',await page.evaluate(()=>typeof window.markBareWrappers==='function'));
  const before=await texts(chunked,['liftArticleHeaders']);
  ok('the chunked fixture shows the problem: its short intro chunk is dropped',before.length>0&&!before.some(s=>s.startsWith(INTRO[0])));
  const after=await texts(chunked,ALL);
  ok('with bare wrappers marked, the two intro paragraphs open the article',!!after[1]&&after[0]===INTRO[0]&&after[1].startsWith(INTRO[1]));
  ok('the rest of the article follows unchanged',after.length===before.length+2&&JSON.stringify(after.slice(2))===JSON.stringify(before));
  ok('it runs to the end of the last chunk',after.length===20&&/^This article is from The Drip/.test(after.at(-1)));
  ok('the summary toggle, related stories, title, deck and footer stay out',!after.some(s=>/EXECUTIVE SUMMARY|Related Story|Read next|mend the fog nets|Three things you should|A primer on|Share this story|©/i.test(s)));
});
