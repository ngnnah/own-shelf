// Link import's article extraction, as the app runs it on a page the Worker fetched: parse, find the subtitle, lift
// article headers, unwrap paragraphs, mark bare wrappers, Readability, htmlToBlocks, put the subtitle first.
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
const ALL=['liftArticleHeaders','unwrapParagraphs','markBareWrappers']; // readable()'s order
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

  // An article whose every paragraph sits four plain <div>s deep, beside a boxed aside of four paragraphs side by
  // side under a "Content" class (BBC Future, 2026)
  must('unwrapParagraphs exists',await page.evaluate(()=>typeof window.unwrapParagraphs==='function'));
  const nested=fixture('nested-paragraph-wrappers.html'),ASIDE=['1. Keep it taut:','2. Keep it clean:','3. Face it right:','4. Mind the gutter:'];
  const boxed=await texts(nested,['liftArticleHeaders','markBareWrappers']);
  ok('the nested fixture shows the problem: without unwrapping, the boxed aside is all that comes in',boxed.length===4&&boxed.every((s,i)=>s.startsWith(ASIDE[i]))||console.log('  got',boxed));
  const whole=await blocks(nested,ALL),wt=whole.map(b=>b.text);
  ok('with paragraphs unwrapped, the whole article comes in, from its first paragraph to its last',wt.length===21&&/^On the ridge above the village/.test(wt[0])&&/^Still, Varga says/.test(wt.at(-1))||console.log('  got',wt));
  ok('its subheadings in place',same(whole.filter(b=>b.t==='h').map(b=>b.text),['A finer mist','The nets themselves'])&&wt.indexOf('A finer mist')===3);
  const box=wt.indexOf('Three ways to help a fog net');
  ok('the aside in its place: its title and four paragraphs after the tenth paragraph',box===12&&ASIDE.every((a,i)=>wt[box+1+i].startsWith(a))&&/^Varga, for her part/.test(wt[box+5]));
  ok('the title, byline, picture credit, "More like this:" and its links, the "--" and the footer stay out',!wt.some(s=>/fog nets catch less|Ada Rivers|More like this|rain gauges|dew pond|^--$|Copyright|Terms of use/.test(s)));
  ok('what stays wrapped: a paragraph under 25 letters (clean-up removes it, as before), one a quarter links or more, one under a "Content" class',
    await page.evaluate(h=>{const d=new DOMParser().parseFromString(h,'text/html');unwrapParagraphs(d);const ps=[...d.querySelectorAll('article p')];
      const up=t=>ps.find(p=>p.textContent.trim().startsWith(t)).parentElement;
      return up('On the ridge').tagName==='ARTICLE'&&up('--').tagName==='DIV'&&up('More like this').tagName==='DIV'&&up('• How rain').tagName==='DIV'&&/ContentStyled/.test(up('1. Keep').className);},nested));
  ok('unwrapping changes nothing on the other fixtures',same(await texts(header,ALL),await texts(header,['liftArticleHeaders','markBareWrappers']))
    &&same(await texts(chunked,ALL,true),await texts(chunked,['liftArticleHeaders','markBareWrappers'],true)));
  // A picture's credit drawn over it, outside the caption (BBC, 2026), in htmlToBlocks
  const fig=html=>page.evaluate(h=>htmlToBlocks(h).map(b=>b.t==='img'?{t:'img',caption:b.caption||''}:{t:b.t,text:b.text}),html);
  const IMG='<img src="https://example.com/net.jpg" alt="Ada Rivers A fog net at dawn">',CAP='<figcaption>A fog net at dawn (Credit: Ada Rivers)</figcaption>';
  const hero=(await page.evaluate(h=>{const d=new DOMParser().parseFromString(h,'text/html');unwrapParagraphs(liftArticleHeaders(d));markBareWrappers(d);
    return htmlToBlocks(new Readability(d).parse().content).slice(0,2).map(b=>b.t==='img'?'img: '+b.caption:b.t+': '+b.text);},nested));
  ok('the nested fixture’s picture comes in with its caption, and its credit isn’t a paragraph',same(hero,['img: A fog net on the ridge at dawn (Credit: Ada Rivers)','p: On the ridge above the village, the fog nets have hung between their poles for thirty years, and for most of that time they filled the tanks below by noon. Lately, the keepers say, the tanks are half empty by the evening.'])||console.log('  got',hero));
  ok('a credit beside the picture that the caption holds is dropped, and the caption stays with its picture',same(await fig(`<figure><div>${IMG}<span class="credit">Ada Rivers</span></div>${CAP}</figure><p>The nets.</p>`),[{t:'img',caption:'A fog net at dawn (Credit: Ada Rivers)'},{t:'p',text:'The nets.'}]));
  ok('…and one only the alt text holds, with no caption',same(await fig(`<figure>${IMG}<span>Ada Rivers</span></figure>`),[{t:'img',caption:''}]));
  ok('other text in a figure stays: a pull quote, a note the caption doesn’t hold',
    same(await fig('<figure><blockquote><p>A net is patient.</p></blockquote><figcaption>Ines Varga</figcaption></figure>'),[{t:'quote',text:'A net is patient.'},{t:'p',text:'Ines Varga'}])
    &&same(await fig(`<figure>${IMG}<p>Drawn by the keepers’ school</p>${CAP}</figure>`),[{t:'img',caption:''},{t:'p',text:'Drawn by the keepers’ school'},{t:'p',text:'A fog net at dawn (Credit: Ada Rivers)'}]));

  /* ---------- the publish date when Readability finds none (pageDate) ---------- */
  must('pageDate exists',await page.evaluate(()=>typeof window.pageDate==='function'));
  // a made-up article page: head, then pre (above the title), body (under the byline), a long text, end (after it)
  const FILL='<p>The nets hang between two poles on the ridge, and the morning fog leaves its water on them.</p>'.repeat(12);
  const pg=({head='',pre='',body='',end='',wrap=s=>s}={})=>`<!doctype html><html><head><title>Mending the fog nets</title>${head}</head><body>${wrap(`<main><article>${pre}<h1>Mending the fog nets</h1><p class="byline">By Ada Rivers</p>${body}${FILL}${end}</article></main>`)}</body></html>`;
  const when=(html,url='https://example.com/fog-nets')=>page.evaluate((h,u)=>pageDate(new DOMParser().parseFromString(h,'text/html'),u),html,url);
  const rdTime=html=>page.evaluate(h=>new Readability(new DOMParser().parseFromString(h,'text/html')).parse().publishedTime,html);
  const ld=o=>`<script type="application/ld+json">${JSON.stringify(o)}</script>`,meta=(a,k,v)=>`<meta ${a}="${k}" content="${v}">`;
  const time=(d,attrs='')=>`<time datetime="${d}"${attrs}>a while ago</time>`;
  const OCT30='October 30, 2026';
  // JSON-LD that Readability 0.5.0 misses
  const ldMissed=[ld({'@context':'https://schema.org/','@type':'NewsArticle',datePublished:'2026-10-30T09:00:00Z'}),
    ld({'@context':'https://schema.org','@graph':[{'@type':['WebPage','ItemPage'],datePublished:'2026-10-29'},{'@type':'Article',datePublished:'2026-10-30'}]}),
    ld({'@context':'https://schema.org','@type':'WebPage',mainEntity:{'@type':'NewsArticle',datePublished:'2026-10-30'}}),
    '<script type="application/ld+json">{ not json</script>'+ld({'@context':'http://schema.org','@type':['BlogPosting'],dateCreated:'2026-10-30'})];
  const ldRd=[],ldGot=[];for(const s of ldMissed){const h=pg({head:s});ldRd.push(await rdTime(h));ldGot.push(await when(h));}
  ok('the JSON-LD fixtures show the problem: Readability finds no date in them',ldRd.every(d=>!d));
  ok('JSON-LD: a "schema.org/" context, a @graph with a list @type (the article before the web page), a mainEntity, a broken script before',ldGot.every(d=>d===OCT30)||console.log('  got',ldGot));
  const metas=[['name','article:published_time','2026-10-30T09:00:00+00:00'],['itemprop','datePublished','2026-10-30'],['name','parsely-pub-date','2026-10-30T09:00:00Z'],
    ['name','sailthru.date','Fri, 30 Oct 2026 09:00:00 -0000'],['name','citation_publication_date','2026/10/30'],['name','DC.date.issued','2026-10-30'],
    ['name','dcterms.created','2026-10-30'],['name','date','20261030'],['name','pubdate','2026-10-30'],['name','publishdate','October 30, 2026']];
  const metaGot=[];for(const [a,k,v] of metas) metaGot.push(await when(pg({head:meta(a,k,v)})));
  ok('meta tags: article:published_time as a name, itemprop, Parse.ly, Sailthru, citation, Dublin Core, date, pubdate, publishdate',metaGot.every(d=>d===OCT30)||console.log('  got',metaGot));
  ok('…which Readability misses',!(await rdTime(pg({head:meta('name','article:published_time','2026-10-30')}))));
  ok('a date with its day wins over one with only the month (Nature’s citation dates)',await when(pg({head:meta('name','citation_publication_date','2026/10')+meta('name','citation_online_date','2026/10/26')}))==='October 26, 2026');
  ok('…and the month alone is kept when nothing has the day',await when(pg({head:meta('name','citation_publication_date','2026/10')}))==='October 2026');
  ok('never a modified date: meta, JSON-LD, a <time> marked or labelled as updated',await when(pg({
    head:meta('property','article:modified_time','2026-11-02')+meta('property','og:updated_time','2026-11-02')+ld({'@context':'https://schema.org','@type':'Article',dateModified:'2026-11-02'}),
    body:`<p>Updated ${time('2026-11-02')}</p><p>${time('2026-11-02',' class="updated"')}</p><p class="date">Last updated 2 November 2026</p>`}))==='');
  ok('a <time> under the byline',await when(pg({body:`<p>${time('2026-10-30T09:00:00Z')}</p>`}))===OCT30);
  ok('…or just above the title',await when(pg({pre:`<p>Science · ${time('2026-10-30')}</p>`}))===OCT30);
  ok('…or one marked as published anywhere in the article',await when(pg({end:`<p class="posted">Posted ${time('2026-10-30')}</p>`}))===OCT30&&await when(pg({end:`<span itemprop="datePublished" content="2026-10-30">Oct 30</span>`}))===OCT30);
  ok('…but not an unmarked one far below the title',await when(pg({end:`<p>${time('2026-10-30')}</p>`}))==='');
  ok('not in an aside, a sidebar, comments, related links or the page footer, even next to the title',(await Promise.all([
    pg({body:`<aside>${time('2026-10-30')}</aside>`}),pg({body:`<div class="sidebar-box">${time('2026-10-30')}</div>`}),
    pg({body:`<ul class="related-stories"><li><a href="/x">Other nets</a> ${time('2026-10-30')}</li></ul>`}),
    pg({end:`<section id="comments"><p>${time('2026-10-30',' itemprop="datePublished"')}</p></section>`}),
    pg({wrap:s=>s+`<footer>${time('2026-10-30',' pubdate')}</footer>`})].map(h=>when(h)))).every(d=>d===''));
  ok('a page wrapper named for its sidebar ("has-sidebar") doesn’t hide the article’s date',await when(pg({body:`<p>${time('2026-10-30')}</p>`,wrap:s=>`<div class="layout has-sidebar">${s}<div class="sidebar">Links</div></div>`}))===OCT30);
  ok('a date class with its text: after a long standfirst (Martin Fowler), a dateline (Daring Fireball)',
    await when(pg({body:`<p class="abstract">${'A long standfirst about nets and fog. '.repeat(18)}</p><p class="date">13 October 2026</p>`}))==='October 13, 2026'&&
    await when(pg({body:'<h6 class="dateline">Wednesday, 12 March 2025</h6>'}))==='March 12, 2025');
  const four={head:ld({'@context':'https://schema.org/','@type':'Article',datePublished:'2026-10-27'})+meta('name','date','2026-10-28'),body:`<p>${time('2026-10-29')}</p>`};
  const U='https://example.com/2026/10/30/fog-nets/';
  ok('the order: JSON-LD, then meta tags, then the page, then the link',
    await when(pg(four),U)==='October 27, 2026'&&await when(pg({...four,head:meta('name','date','2026-10-28')}),U)==='October 28, 2026'&&
    await when(pg({body:four.body}),U)==='October 29, 2026'&&await when(pg(),U)===OCT30);
  ok('the link: BBC’s article/20261015-…, a month only',await when(pg(),'https://www.bbc.com/future/article/20261015-fog-nets')==='October 15, 2026'&&await when(pg(),'https://example.com/2026/10/fog-nets')==='October 2026');
  const bad={head:ld({'@context':'https://schema.org','@type':'Article',datePublished:'1850-01-01'})+meta('name','date','2099-01-01'),body:`<p>${time('2026-02-30')}</p>`};
  ok('impossible dates are passed over: before 1900, ahead, no such day',await when(pg(bad),U)===OCT30&&await when(pg(bad))==='');
  ok('nothing found: no date',await when(pg())==='');
});
