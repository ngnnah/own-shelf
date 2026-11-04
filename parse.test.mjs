import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ok,done} from './test-util.mjs';

// parse.js is a classic browser script; run it in a sandbox and pick up its globals.
const P={};vm.runInNewContext(readFileSync(new URL('./parse.js',import.meta.url),'utf8'),Object.assign(P,{TextDecoder,module:{}}));
const {firstUrl,isLoneUrl,firstUri,sharedLink,decodeBody,mdToBlocks,finalize,parseDate,isKindleNotebook,kindleNotebook,kindleHighlights,mergeKindle,joinHighlights,withDek}=P.module.exports;

ok('firstUrl: bare link',firstUrl('https://example.com/a?b=1')==='https://example.com/a?b=1');
ok('firstUrl: from shared text',firstUrl('Read this: “Great essay” https://example.com/x/y.html.')==='https://example.com/x/y.html');
ok('firstUrl: drops closing bracket',firstUrl('(see https://example.com/p)')==='https://example.com/p');
ok('firstUrl: none',firstUrl('no link here')===''&&firstUrl(null)==='');
ok('isLoneUrl',isLoneUrl('  https://a.com/x \n')&&!isLoneUrl('see https://a.com')&&!isLoneUrl(''));
ok('firstUri: first line, comments and blanks skipped',firstUri('# from an app\r\n\r\nhttps://a.com/x\r\nhttps://a.com/y')==='https://a.com/x'&&firstUri('')===''&&firstUri('# only a comment')==='');

// sharedLink: a copied link with at most its title, from another app's share sheet
const U='https://example.com/2026/11/03/fog-nets/';
ok('sharedLink: a link alone',sharedLink(U)===U&&sharedLink('',[U])===U);
ok('sharedLink: "Title https://…"',sharedLink('How fog nets water a village '+U)===U);
ok('sharedLink: title and link on two lines',sharedLink('How fog nets water a village\n'+U+'\n')===U);
ok('sharedLink: a title beside a copied URL',sharedLink('How fog nets water a village | MIT Technology Review',[U])===U);
ok('sharedLink: a "via" line and the link',sharedLink('How fog nets water a village\nvia Tech Review\n'+U)===U);
ok('sharedLink: the link said twice (an anchor and its text)',sharedLink('Fog nets '+U,[U])===U);
ok('sharedLink: tracking parameters count once; the copied URL is kept',sharedLink('Fog nets '+U+'?utm_source=app&utm_medium=share',[U])===U
  &&sharedLink('Fog nets '+U+'?utm_source=app')===U+'?utm_source=app');
ok('sharedLink: a non-web copied URL is no link',sharedLink('',['mailto:a@example.com'])===''&&sharedLink('Fog nets',['app-scheme://story/1'])==='');
ok('sharedLink: no link',sharedLink('Just a title')===''&&sharedLink('')===''&&sharedLink(null,[''])==='');
ok('sharedLink: two different links are none',sharedLink(U+' https://example.com/other')===''&&sharedLink('Fog nets',[U,'https://example.org/x'])==='');
const para='Fog nets are strung between two poles on the ridge above the village, and the water they catch runs down a pipe to a tank by the school. The full report is at '+U+' and it is worth reading.';
ok('sharedLink: a paragraph that holds a link is none',sharedLink(para)===''&&sharedLink(para,[U])==='');
ok('sharedLink: three lines of text besides the link are none',sharedLink('Fog nets\nA village on the ridge\nShared from an app\n'+U)==='');
ok('sharedLink: the title limit is 150 characters',sharedLink('x'.repeat(150)+' '+U)===U&&sharedLink('x'.repeat(151)+' '+U)==='');

const sjis=new Uint8Array([0x93,0xfa,0x96,0x7b]); // 日本 in Shift_JIS
ok('decodeBody: charset from header',decodeBody(sjis.buffer,'text/html; charset=Shift_JIS')==='日本');
const meta=new TextEncoder().encode('<meta charset="utf-8"><p>Tiếng Việt</p>');
ok('decodeBody: utf-8 default and meta tag',decodeBody(meta.buffer,'text/html').includes('Tiếng Việt'));
ok('decodeBody: unknown charset falls back to utf-8',decodeBody(new TextEncoder().encode('é').buffer,'text/html; charset=bogus')==='é');

const doc=finalize(mdToBlocks('# The Quiet Engine\n\nBy Ada Rivers\n\nMarch 14, 2025\n\n'+'Most great tools start as toys. '.repeat(20)+'\n\n## Why\n\n'+'Small things win. '.repeat(20)),{});
ok('finalize: title, author, date from Markdown',doc.title==='The Quiet Engine'&&doc.author==='Ada Rivers'&&doc.writtenSort==='2025-03-14');
ok('finalize: explicit title wins (link import)',finalize(mdToBlocks('## Intro\n\n'+'Words here. '.repeat(30)),{title:'From Readability'}).title==='From Readability');
ok('parseDate: ISO and long forms',parseDate('2024-03-01T10:00:00Z')==='2024-03-01'&&parseDate('July 2023')==='2023-07-01');

/* ---------- link import: a page's publish date (pageDate's pieces; pageDate itself in tests/browser/linkimport.mjs) ---------- */
const {dateText,urlDate,ldDates}=P; // function declarations land on the sandbox
const all=(f,cases)=>Object.entries(cases).every(([i,want])=>f(i)===want||console.log('  got',JSON.stringify(f(i)),'for',i));
ok('dateText: the forms pages use, written as link import writes dates',all(dateText,{
  '2026-10-30':'October 30, 2026','2026-10-30T09:15:00Z':'October 30, 2026','2026/10/30':'October 30, 2026','2026.10.30':'October 30, 2026',
  '20261030':'October 30, 2026','20261030T091500Z':'October 30, 2026','Oct 30, 2026':'October 30, 2026','October 30th, 2026':'October 30, 2026',
  '30 October 2026':'October 30, 2026','3rd November 2026':'November 3, 2026','Wednesday, 12 March 2025':'March 12, 2025',
  'Fri, 30 Oct 2026 09:15:00 GMT':'October 30, 2026','Published On 4 Nov 2026 4 Nov 2026':'November 4, 2026',
  '[Submitted on 12 Jun 2017 (v1), last revised 2 Aug 2023]':'June 12, 2017'}));
ok('dateText: the page’s own day, whatever its time zone',dateText('2026-10-30T23:30:00-04:00')==='October 30, 2026'&&dateText('2026-10-31T00:30:00+09:00')==='October 31, 2026');
ok('dateText: a month without a day',all(dateText,{'2026/10':'October 2026','2026-10':'October 2026','October 2026':'October 2026','Sept. 2026':'September 2026'}));
ok('dateText: …which parseDate sorts',parseDate(dateText('2026/10'))==='2026-10-01'&&parseDate(dateText('3rd November 2026'))==='2026-11-03');
const ahead=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
ok('dateText: impossible dates are rejected',all(dateText,{'1899-12-31':'','2026-02-30':'','2026-13-01':'','2026-00-10':'','2099-01-01':'',[ahead(3)]:''}));
ok('dateText: today and tomorrow are fine (time zones)',!!dateText(ahead(0))&&!!dateText(ahead(1)));
ok('dateText: a year alone, a timestamp, a relative date or nothing gives nothing',all(dateText,{'2026':'','1730246400':'','2 days ago':'','':'',undefined:''}));
ok('urlDate: the date in a link',all(urlDate,{
  'https://example.com/2026/10/30/fog-nets/':'October 30, 2026','https://example.com/news/2026/11/4/fog-nets':'November 4, 2026',
  'https://example.com/2026/Nov/3/fog-nets/':'November 3, 2026','https://example.com/blog/2026-10-30-fog-nets':'October 30, 2026',
  'https://www.bbc.com/future/article/20261015-fog-nets':'October 15, 2026','https://example.com/fog-nets-20261021/':'October 21, 2026',
  'https://example.com/2026/10/fog-nets':'October 2026'}));
ok('urlDate: no date, an id, an impossible date, a query or no link gives nothing',all(urlDate,{
  'https://example.com/fog-nets':'','https://example.com/news/1025576/fog-nets':'','https://example.com/p/20261399-fog':'',
  'https://example.com/2026/13/45/fog':'','https://example.com/2026/Foo/3/fog':'','https://example.com/read?d=2026-10-30':'','not a link':''}));
const LD={'@context':'https://schema.org/'};
ok('ldDates: an article’s datePublished',ldDates([{...LD,'@type':'NewsArticle',datePublished:'2026-10-30T09:00:00Z',dateModified:'2026-11-02'}])[0]==='2026-10-30T09:00:00Z');
ok('ldDates: in a @graph, the article before the web page',ldDates([{...LD,'@graph':[{'@type':'WebSite'},{'@type':'WebPage',datePublished:'2026-10-29'},{'@type':'BlogPosting',datePublished:'2026-10-30'}]}]).join()==='2026-10-30,2026-10-29');
ok('ldDates: across scripts and arrays, in a mainEntity, with @type as a list or a URL',
  ldDates([null,[{'@type':'Organization',name:'Fog Weekly'}],{...LD,'@type':'WebPage',mainEntity:{'@type':['Article','Report'],datePublished:'2026-10-26'}}])[0]==='2026-10-26'&&
  ldDates({'@type':'http://schema.org/TechArticle',datePublished:{'@value':'2026-10-25'}})[0]==='2026-10-25');
ok('ldDates: dateCreated when there is no datePublished',ldDates({'@type':'Article',dateCreated:'2026-10-24'})[0]==='2026-10-24');
ok('ldDates: never a modified date, nor a comment’s or a person’s date',ldDates([{'@type':'Article',dateModified:'2026-11-02'},{'@type':'Comment',datePublished:'2026-11-01'},{'@type':'Person',birthDate:'1990-01-01'}]).length===0);

// finalize({verbatim}) keeps every block: no title, byline, date or footnote guessing
const vb=finalize(mdToBlocks('By the dead, said the first line.\n\nMarch 14, 2025\n\nNotes\n\n[1] Not a footnote.'),{title:'T',verbatim:true});
ok('finalize verbatim: keeps a "By …" first line, a date line and a Notes block',vb.blocks.length===4&&vb.blocks[0].text.startsWith('By the dead')&&!vb.author&&!vb.written&&!vb.notes.length);

/* ---------- Kindle notebook export ---------- */
const kfix=readFileSync(new URL('./tests/fixtures/kindle-notebook.html',import.meta.url),'utf8');
ok('isKindleNotebook: the export yes, an ordinary page no',isKindleNotebook(kfix)&&!isKindleNotebook('<html><body><div class="note">x</div></body></html>'));
const kn=kindleNotebook(kfix);
ok('kindle: title and flipped author',kn.title==='The Lighthouse Ledger (Harbour Tales Book 2)'&&kn.author==='Ada Rivers');
const kshape=kn.blocks.map(b=>b.t==='h'?`h${b.level}:${b.text}`:`p:${b.kh.color}`).join('|');
ok('kindle: parts, chapters (again after a new part), highlights; the bookmark skipped',
  kshape==='h2:Part One|h3:The Keeper|p:sun|p:sky|h3:Storms|p:coral|p:sun|p:amber|h2:Part Two|h3:Storms|p:sky|p:sky');
ok('kindle colours: orange is amber; pink and red coral; aqua and blue sky; green mint',(()=>{
  const k=kindleNotebook(['orange','pink','red','aqua','blue','green'].map(c=>`<div class="noteHeading">Highlight(<span class="annotation_${c}">${c}</span>) - Location 1</div><div class="noteText">A ${c} line.</div>`).join(''));
  return k.blocks.map(b=>b.kh.color).join()==='amber,coral,coral,sky,sky,mint';})());
const kp=kn.blocks.filter(b=>b.kh);
ok('kindle: a note inside a highlight attaches to it',kp[0].text.startsWith('By the lamp')&&kp[0].kh.note==='Opening line I want to remember.'&&!kp[1].kh.note);
ok('kindle: a note on no highlight becomes its own passage',kp[3].text==='A thought of my own, not on any highlight.'&&kp[3].kh.note===kp[3].text);
ok('kindle: entities decoded, whitespace collapsed',kp[4].text==='Ships & sailors “rarely” agree on the weather.');
ok('kindle: older export markup (h3 headings, mismatched closers, highlight_ classes)',(()=>{
  const k=kindleNotebook("<div class='bookTitle'>Old Format</div><div class='authors'>Plain Name</div><h2 class='sectionHeading'>One</h2><h3 class='noteHeading'>Highlight (<span class='highlight_green'>green</span>) - Location 12</h3><div class='noteText'>First line<br/>second line</h3><h3 class='noteHeading'>Note - Location 99</h3><div class='noteText'>Far away note</h3>");
  return k.author==='Plain Name'&&k.blocks.length===3&&k.blocks[1].text==='First line second line'&&k.blocks[1].kh.color==='mint'&&!k.blocks[1].kh.note&&k.blocks[2].kh.note==='Far away note';})());

const kdoc=finalize(kn.blocks,{title:kn.title,author:kn.author,verbatim:true});
const khl=kindleHighlights(kdoc,1000000);
ok('kindleHighlights: one full-block highlight per passage, in order',khl.length===7&&khl.every(h=>{const b=kdoc.blocks.find(x=>x.id===h.segs[0].pid);return h.segs.length===1&&h.segs[0].s===0&&h.segs[0].e===b.text.length;})&&khl[0].note==='Opening line I want to remember.');
ok('kindleHighlights: unique ids, newest-first order matches book order, kh removed',new Set(khl.map(h=>h.id)).size===7&&khl[0].at>khl[6].at&&!kdoc.blocks.some(b=>b.kh));
ok('kindle doc: sections are the parts',kdoc.sections.length===2&&kdoc.sections[0].title==='Part One'&&kdoc.sections[1].title==='Part Two');

// merge: a newer export drops one passage (deleted on the Kindle) and adds one
const textOf=(doc,pid)=>doc.blocks.find(b=>b.id===pid).text;
const mine=JSON.parse(JSON.stringify(khl));
mine[0].color='mint';                                  // recoloured in own-shelf
mine[2].note='my note on the squall';                  // note added in own-shelf
mine.splice(4,1);                                      // "Ships & sailors…" highlight removed in own-shelf
const storm=kdoc.blocks.find(b=>b.text.startsWith('The storm'));
mine.push({id:'hmine',color:'coral',note:'',segs:[{pid:storm.id,s:4,e:9}],at:5});   // a partial highlight made in own-shelf
const newer=kfix.replace(/<div class="noteHeading">\s*Highlight\(<span class="annotation_purple">[\s\S]*?no chapter at all\.\s*<\/div>/,'')
  .replace('Part Two\n</div>','Part Two\n</div><div class="noteHeading">Highlight(<span class="annotation_yellow">yellow</span>) - Storms > Page 19 · Location 290</div><div class="noteText">A brand new line from the second read.</div>');
const nn=kindleNotebook(newer),ndoc=finalize(nn.blocks,{title:nn.title,author:nn.author,verbatim:true}),nhl=kindleHighlights(ndoc,2000000);
const mr=mergeKindle(kdoc,mine,ndoc,nhl);
const byId=Object.fromEntries(mr.hl.map(h=>[h.id,h]));
ok('mergeKindle: counts (1 new passage, 1 gone)',mr.added===1&&mr.dropped===1&&!mr.same);
ok('mergeKindle: own-shelf colour and note carried over',byId[mine[0].id].color==='mint'&&byId[mine[2].id].note==='my note on the squall');
ok('mergeKindle: carried highlights point at the same text in the new doc',mr.hl.every(h=>h.segs.every(s=>ndoc.blocks.some(b=>b.id===s.pid))) &&
  textOf(ndoc,byId.hmine.segs[0].pid)===storm.text&&byId.hmine.segs[0].s===4&&textOf(ndoc,byId[mine[0].id].segs[0].pid).startsWith('By the lamp'));
ok('mergeKindle: a highlight removed in own-shelf stays removed',!mr.hl.some(h=>h.segs.some(s=>textOf(ndoc,s.pid).startsWith('Ships'))));
ok('mergeKindle: the new passage arrives highlighted',mr.hl.some(h=>textOf(ndoc,h.segs[0].pid)==='A brand new line from the second read.'));
const again=mergeKindle(kdoc,khl,kdoc,khl);
ok('mergeKindle: the same export again is a no-op',again.same&&again.added===0&&again.dropped===0&&again.hl.length===khl.length);
const twin=t=>finalize([{t:'p',text:t,marks:[],kh:{color:'sun',note:''}},{t:'p',text:t,marks:[],kh:{color:'sun',note:''}}],{title:'Twin',verbatim:true});
const t1=twin('Yes.'),t1h=kindleHighlights(t1,1),t2=twin('Yes.'),t2h=kindleHighlights(t2,2);t1h[1].note='second';
const tm=mergeKindle(t1,t1h,t2,t2h);
ok('mergeKindle: passages with the same text map one to one',tm.same&&tm.hl.length===2&&new Set(tm.hl.map(h=>h.segs[0].pid)).size===2&&tm.hl.find(h=>h.note==='second').segs[0].pid==='b1');

// re-importing a notebook first imported when Kindle orange became coral
const orangeB=kdoc.blocks.find(b=>b.text.startsWith('Ships')),pinkB=kdoc.blocks.find(b=>b.text==='squall,');
const was=JSON.parse(JSON.stringify(khl)).map(h=>h.segs[0].pid===orangeB.id?Object.assign(h,{color:'coral'}):h);
was.push({id:'hpart',color:'coral',note:'',segs:[{pid:orangeB.id,s:0,e:5}],at:9});   // a partial coral highlight made in own-shelf
const ro=mergeKindle(kdoc,was,kdoc,khl),roBy=Object.fromEntries(ro.hl.map(h=>[h.id,h]));
const onOrange=ro.hl.find(h=>h.id!=='hpart'&&h.segs[0].pid===orangeB.id);
ok('mergeKindle: a coral highlight on an orange passage becomes amber',onOrange.color==='amber'&&ro.recoloured.amber===1);
ok('mergeKindle: pink stays coral, a partial coral highlight stays coral',ro.hl.find(h=>h.segs[0].pid===pinkB.id).color==='coral'&&roBy.hpart.color==='coral');
ok('mergeKindle: a recolour alone is not "the same export"',!ro.same&&ro.added===0&&ro.dropped===0&&ro.hl.length===was.length);
const mineSky=JSON.parse(JSON.stringify(khl)).map(h=>h.segs[0].pid===orangeB.id?Object.assign(h,{color:'sky'}):h);
const rs=mergeKindle(kdoc,mineSky,kdoc,khl);
ok('mergeKindle: an orange passage the owner recoloured keeps its colour',rs.hl.find(h=>h.segs[0].pid===orangeB.id).color==='sky'&&!Object.keys(rs.recoloured).length&&rs.same);

// …and when Kindle aqua became mint
const aquaB=kdoc.blocks.find(b=>b.text.startsWith('The storm came back')),sunB=kdoc.blocks.find(b=>b.text.startsWith('By the lamp'));
const wasMint=JSON.parse(JSON.stringify(khl)).map(h=>h.segs[0].pid===aquaB.id?Object.assign(h,{color:'mint'}):h);
const ra=mergeKindle(kdoc,wasMint,kdoc,khl);
ok('mergeKindle: a mint highlight on an aqua passage becomes sky, and says so',ra.hl.find(h=>h.segs[0].pid===aquaB.id).color==='sky'&&ra.recoloured.sky===1&&!ra.recoloured.amber&&!ra.same);
const mintOnSun=JSON.parse(JSON.stringify(khl)).map(h=>h.segs[0].pid===sunB.id?Object.assign(h,{color:'mint'}):h);
ok('mergeKindle: mint the owner chose on a yellow passage stays mint',mergeKindle(kdoc,mintOnSun,kdoc,khl).hl.find(h=>h.segs[0].pid===sunB.id).color==='mint');

/* ---------- joining highlights ---------- */
// three blocks; b1 (47 characters): "Alpha beta, gamma delta epsilon zeta eta theta."
const TX={b0:'The first paragraph is short.',b1:'Alpha beta, gamma delta epsilon zeta eta theta.',b2:'Second paragraph starts here and goes on.'};
const ORD={b0:0,b1:1,b2:2};
const H=(id,at,segs,more)=>Object.assign({id,color:'sky',note:'',segs:segs.map(([pid,s,e])=>({pid,s,e})),at},more);
const fresh=(segs,color='mint',note='')=>H('hnew',100,segs,{color,note});
const textsOf=f=>Object.fromEntries(f.segs.map(s=>[s.pid,TX[s.pid]]));
const join=(hl,f,linked)=>joinHighlights(hl,f,textsOf(f),ORD,linked);
const segsOf=h=>h.segs.map(s=>`${s.pid}:${s.s}-${s.e}`).join(' ');

const lone=fresh([['b1',12,17]]);
ok('join: nothing near, a new highlight',(r=>r.h===lone&&!r.hit.length&&r.n===0)(join([H('ha',1,[['b1',0,5]])],lone)));
ok('join: overlap at its start',(r=>r.h.id==='ha'&&segsOf(r.h)==='b1:12-27'&&r.n===2&&r.h.color==='mint')(join([H('ha',1,[['b1',18,27]])],fresh([['b1',12,22]]))));
ok('join: overlap at its end',(r=>r.h.id==='ha'&&segsOf(r.h)==='b1:12-33')(join([H('ha',1,[['b1',12,22]])],fresh([['b1',18,33]]))));
const two=[H('hb',5,[['b1',24,33]]),H('ha',2,[['b1',0,5]]),H('hc',3,[['b2',0,6]])];
const br=join(two,fresh([['b1',3,28]]));
ok('join: one highlight bridging two takes in both, keeps the earlier id, leaves the rest',br.h.id==='ha'&&br.h.at===2&&segsOf(br.h)==='b1:0-33'&&br.n===3&&br.hit.map(h=>h.id).join()==='hb,ha');
ok('join: touching with only a space between',(r=>r.n===2&&segsOf(r.h)==='b1:0-10')(join([H('ha',1,[['b1',0,5]])],fresh([['b1',6,10]]))));
ok('join: touching end to end, nothing between',(r=>r.n===2&&segsOf(r.h)==='b1:0-10')(join([H('ha',1,[['b1',0,6]])],fresh([['b1',6,10]]))));
ok('join: punctuation between is not touching',join([H('ha',1,[['b1',6,10]])],fresh([['b1',12,17]])).n===0);
ok('join: touching across blocks is not touching',join([H('ha',1,[['b1',0,47]])],fresh([['b2',0,6]])).n===0);
const across=join([H('ha',1,[['b1',41,47]]),H('hb',2,[['b2',0,6]])],fresh([['b2',0,3],['b1',35,47]]));
ok('join: across two paragraphs, one seg per block in reading order',across.h.id==='ha'&&segsOf(across.h)==='b1:35-47 b2:0-6'&&across.n===3);
const multi=join([H('ha',1,[['b0',20,28],['b1',0,10]])],fresh([['b1',5,17]]));
ok('join: a highlight over two blocks grows in the block touched',segsOf(multi.h)==='b0:20-28 b1:0-17');
const inner=H('ha',1,[['b1',0,31]],{note:'mine',study:{as:'skip',at:1}});
ok('join: inside one (though touching another), recolours it and nothing else',(r=>r.n===0&&r.hit.length===1&&r.h.id==='ha'&&r.h.color==='mint'&&r.h.segs===inner.segs&&r.h.note==='mine'&&r.h.study.as==='skip')(join([inner,H('hz',2,[['b1',32,40]])],fresh([['b1',12,31]]))));
ok('join: inside one, Note (no colour) keeps its colour',join([inner],fresh([['b1',12,17]],null)).h.color==='sky');
ok('join: Note (no colour) on an overlap keeps the colour of the one kept',join([H('ha',1,[['b1',0,5]],{color:'coral'})],fresh([['b1',3,10]],null)).h.color==='coral');
const noted=join([H('hb',1,[['b1',24,33]],{note:'second'}),H('ha',2,[['b1',0,5]],{note:'first'}),H('hc',3,[['b1',41,47]],{note:'first'})],fresh([['b1',3,45]],'mint','middle'));
ok('join: notes in reading order, a blank line apart, no repeats',noted.h.note==='first\n\nmiddle\n\nsecond');
ok('join: a sorted highlight keeps its id, though made later',(r=>r.h.id==='hb'&&r.h.at===5&&r.h.study.as==='fact')(join([H('ha',2,[['b1',0,5]]),H('hb',5,[['b1',24,33]],{study:{as:'fact',at:6}})],fresh([['b1',3,28]]))));
ok('join: so does one with a fact card',join([H('ha',2,[['b1',0,5]]),H('hb',5,[['b1',24,33]])],fresh([['b1',3,28]]),new Set(['hb'])).h.id==='hb');
ok('join: of several sorted or with a card, the earliest-made',join([H('ha',2,[['b1',0,5]]),H('hb',5,[['b1',24,33]],{study:{as:'words',at:6}}),H('hc',4,[['b1',41,47]])],fresh([['b1',3,45]]),new Set(['hc'])).h.id==='hc');
const orig=[H('ha',1,[['b1',18,27]],{note:'a'})],copy=JSON.stringify(orig),f1=fresh([['b1',12,22]]),fcopy=JSON.stringify(f1);
join(orig,f1);
ok('join: changes neither the highlights nor the new one',JSON.stringify(orig)===copy&&JSON.stringify(f1)===fcopy);

/* ---------- link import: the subtitle ---------- */
const P_=t=>({t:'p',text:t,marks:[]}),body=[P_('First paragraph of the story.'),P_('A second one, a little longer.')];
const dek=[P_('A made-up subtitle about fog nets.')];
ok('withDek: a subtitle missing from the article comes first',(r=>r.length===3&&r[0]===dek[0]&&r[1]===body[0])(withDek(body,dek)));
ok('withDek: not when the article already holds it, whatever the spacing and punctuation',withDek([P_('A made-up subtitle — about fog nets!'),...body],dek).length===3);
ok('withDek: not when it runs across two of the article’s paragraphs',withDek([P_('A made-up subtitle'),P_('about fog nets.'),...body],dek).length===4);
ok('withDek: no subtitle, no change',withDek(body,[])===body);
ok('withDek: letters of any script count',withDek([P_('霧の網についての物語。')],[P_('霧の網')]).length===1&&withDek([P_('霧の網についての物語。')],[P_('山の話。')]).length===2&&withDek([P_('Câu chuyện.')],[P_('Lưới sương mù.')]).length===2);

/* ---------- read aloud: the pieces Listen speaks ---------- */
const {speechChunks,speechWord}=P.module.exports;
const said=(t,...a)=>speechChunks(t,...a).map(([s,e])=>t.slice(s,e));
const sp2='The tide came in over the long grey stones. The keeper lit the lamp at six o’clock!';
ok('speech: one piece per sentence, offsets into the text',JSON.stringify(said(sp2))===JSON.stringify(['The tide came in over the long grey stones.','The keeper lit the lamp at six o’clock!']));
ok('speech: closing quotes stay with their sentence',JSON.stringify(said('He said, “Hold the rope tight, all of you.” Then the wind rose over the harbour wall.'))===JSON.stringify(['He said, “Hold the rope tight, all of you.”','Then the wind rose over the harbour wall.']));
ok('speech: abbreviations, initials and a lower-case next word don’t end a sentence',said('Mr. Hale met Dr. Ames and J. R. Tolkien at the U.S. office near St. Paul for lunch today. e.g. this is a fragment; it goes on.').length===1);
ok('speech: a short sentence joins the next',JSON.stringify(said('Yes. No. The harbour was quiet that night, and nobody moved.'))===JSON.stringify(['Yes. No. The harbour was quiet that night, and nobody moved.']));
const long='The keeper climbed the stairs slowly, counting each step under his breath, '.repeat(5)+'and at the top he rested.';
const lc=speechChunks(long);
ok('speech: a long sentence is cut under the limit, after a comma',lc.length>1&&lc.every(([s,e])=>e-s<=220)&&lc.slice(0,-1).every(([,e])=>long[e-1]===','));
ok('speech: the pieces cover the text in order, without spaces at their ends',lc.every(([s,e],i)=>!/^\s|\s$/.test(long.slice(s,e))&&(!i||s>lc[i-1][1]))&&long.slice(lc.at(-1)[0],lc.at(-1)[1]).endsWith('rested.'));
const nocomma='word '.repeat(80).trim();
ok('speech: no comma, cut at a space',speechChunks(nocomma).every(([s,e])=>e-s<=220&&nocomma.slice(s,e).split(' ').every(w=>w==='word')));
ok('speech: a line break ends a piece; empty text gives none',said('First line of the verse here\nSecond line of the verse there',220,0).length===2&&speechChunks('  ').length===0&&speechChunks('').length===0);
ok('speech word: from the boundary’s index and length, punctuation trimmed',JSON.stringify(speechWord('He said, “Hold on.”',9,6))==='[10,14]'&&JSON.stringify(speechWord('Hello, world.',0,6))==='[0,5]');
ok('speech word: without a length, to the next space',JSON.stringify(speechWord('the tide, rising',4))==='[4,8]'&&JSON.stringify(speechWord('a  b',1))==='[3,4]');

done();
