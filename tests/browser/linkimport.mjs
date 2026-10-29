// Link import's article extraction, as the app runs it on a page the Worker fetched: parse, find the subtitle, lift
// article headers, mark bare wrappers, Readability, htmlToBlocks, put the subtitle first.
// Usage: node tests/browser/linkimport.mjs [repo dir]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {start} from './lib.mjs';

const t=await start('linkimport',8150);
const {page,ok,must,until}=t;
const fixture=name=>readFileSync(join(t.repo,'tests/fixtures',name),'utf8');
const header=fixture('article-header-summary.html'),chunked=fixture('chunked-article-intro.html');
const SUMMARY='A made-up summary in a highlighted box';
const INTRO=['How much do you know about fog nets?','Maybe, like me, you have seen a photo'];
const DEK='A primer on a quiet and frankly odd piece of water engineering.';
// The article's blocks after the given clean-up steps (parse.js globals), in order; dek: find the subtitle first
// (pageDek) and put it at the top (withDek), as readable() in app.js does.
const blocks=(html,steps,dek)=>page.evaluate((html,steps,dek)=>{
  const doc=new DOMParser().parseFromString(html,'text/html');
  const d=dek?pageDek(doc):[];
  steps.forEach(s=>window[s](doc));
  return withDek(htmlToBlocks(new Readability(doc).parse().content),d).filter(b=>b.text).map(b=>({t:b.t,text:b.text}));
},html,steps,dek);
const texts=async(...a)=>(await blocks(...a)).map(b=>b.text);
const ALL=['liftArticleHeaders','markBareWrappers'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

await t.run(async()=>{
  await page.goto(t.base,{waitUntil:'networkidle0'});
  must('Readability and parse.js loaded',await until(()=>window.Readability&&window.htmlToBlocks));
  ok('the fixture shows the problem: Readability alone drops the summary in the article header',!(await texts(header,[])).some(s=>s.startsWith(SUMMARY)));
  must('liftArticleHeaders exists',await page.evaluate(()=>typeof window.liftArticleHeaders==='function'));
  const got=await texts(header,['liftArticleHeaders']);
  ok('with the header lifted, the summary opens the article',!!got[0]&&got[0].startsWith(SUMMARY));
  ok('every note follows',got.length===19&&got[1].startsWith('The harbour town')&&got[18].startsWith('The lighthouse keeper'));
  ok('the title and the short meta lines stay out',!got.some(s=>/Harbour Manners|ISBN|recommend it|date read/.test(s)));
  ok('marking bare wrappers too changes nothing on that page',same(await texts(header,ALL),got));

  // An article in chunks, each in a bare <div>, beside an "Executive summary" toggle (MIT Technology Review, 2026)
  must('markBareWrappers exists',await page.evaluate(()=>typeof window.markBareWrappers==='function'));
  const before=await texts(chunked,['liftArticleHeaders']);
  ok('the chunked fixture shows the problem: its short intro chunk is dropped',before.length>0&&!before.some(s=>s.startsWith(INTRO[0])));
  const after=await texts(chunked,ALL);
  ok('with bare wrappers marked, the two intro paragraphs open the article',!!after[1]&&after[0]===INTRO[0]&&after[1].startsWith(INTRO[1]));
  ok('the rest of the article follows unchanged',after.length===before.length+2&&same(after.slice(2),before));
  ok('it runs to the end of the last chunk',after.length===20&&/^This article is from The Drip/.test(after.at(-1)));
  ok('the summary toggle, related stories, title, deck and footer stay out',!after.some(s=>/EXECUTIVE SUMMARY|Related Story|Read next|mend the fog nets|Three things you should|A primer on|Share this story|©/i.test(s)));

  // The subtitle (deck) under the title sits in the page header, beside the body's chunks; it is the page's
  // og:description (MIT Technology Review, 2026; also the Guardian, Ars Technica, The Verge, Substack)
  must('pageDek and withDek exist',await page.evaluate(()=>typeof window.pageDek==='function'&&typeof window.withDek==='function'));
  const full=await blocks(chunked,ALL,true);
  ok('with the subtitle found under the title, it opens the article as a paragraph',!!full[0]&&full[0].text===DEK&&full[0].t==='p');
  ok('the intro and the rest follow unchanged',same(full.slice(1).map(b=>b.text),after));
  ok('the title and the rest of the header still stay out',!full.some(b=>/Three things you should|Ada Rivers|October 22|Stock photo/.test(b.text)));
  const variant=(from,to)=>{const h=chunked.replace(from,to);if(h===chunked) throw new Error('variant unchanged: '+from);return h;};
  const deckDiv=/<div class="contentArticleHeader__deck">.*?<\/div>/,h1=/<h1 class="contentArticleHeader__title">.*?<\/h1>/;
  const asH3=await blocks(variant(deckDiv,`<h3 class="subtitle">${DEK}</h3>`),ALL,true);
  ok('a subtitle set as a heading (Substack) comes in as a paragraph, not a section heading',!!asH3[0]&&asH3[0].text===DEK&&asH3[0].t==='p');
  ok('nothing comes in when the page has no description',same(await texts(variant(/<meta property="og:description"[^>]*>/,''),ALL,true),after));
  ok('nor when the description isn’t shown on the page (BBC)',same(await texts(variant(DEK+'">','A summary written for search results only, never shown.">'),ALL,true),after));
  ok('nor when it is hidden',same(await texts(variant('<div class="contentArticleHeader__deck">','<div class="contentArticleHeader__deck" hidden>'),ALL,true),after));
  const title=chunked.match(h1)[0],deck=chunked.match(deckDiv)[0];
  ok('nor when it comes before the title (a summary for voice assistants, NPR)',same(await texts(variant(title+'\n'+deck,deck+'\n'+title),ALL,true),after));
  const far='<p class="contentArticleHeader__note">'+'A long note between the title and the deck. '.repeat(6)+'</p>';
  ok('nor when it sits more than 200 letters below the title',same(await texts(variant(title,title+far),ALL,true),after));
  const shown=header.replace('</head>',`<meta name="description" content="${header.match(/<div id="summary">\s*([^<]*?)\s*<\/div>/)[1]}">\n</head>`);
  const once=await texts(shown,ALL,true);
  ok('a subtitle the article already holds isn’t added twice',once.filter(s=>s.startsWith(SUMMARY)).length===1&&same(once,got));

  // A newsletter in chunks whose last chunk is a list of links (MIT Technology Review's The Download, 2026)
  const links=fixture('chunked-newsletter-links.html'),LINKS=['Find out how the old map was found.','—Bo Lindqvist','Small pleasures'];
  await page.evaluate(()=>{window.neutralWrappers=doc=>{doc.querySelectorAll('div').forEach(d=>{if(!d.attributes.length&&d.childElementCount===1&&![...d.childNodes].some(n=>n.nodeType===3&&n.nodeValue.trim())) d.className='bare-wrapper';});};});
  const cut=await texts(links,['liftArticleHeaders','neutralWrappers']);
  ok('the newsletter fixture shows the problem: with one neutral class on the wrappers, the closing list of links is cleaned away',cut.length>0&&/^One more thing/.test(cut[cut.length-2])&&!cut.some(s=>LINKS.includes(s)));
  const kept=await texts(links,ALL,true);
  ok('with wrappers taking their chunk’s class weight, the newsletter runs to its last link',same(kept.slice(-8,-5),LINKS)&&/^\+ These are the oddest weather records/.test(kept.at(-1)));
  ok('everything before the list is as before',same(kept.slice(0,cut.length),cut)&&kept.length===cut.length+8);
  ok('the footer, title and byline stay out',!kept.some(s=>/Share this story|©|The Morning Drip:|Ada Rivers|October 27/.test(s)));
});
