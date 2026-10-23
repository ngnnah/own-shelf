import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ok,done} from './test-util.mjs';

// parse.js is a classic browser script; run it in a sandbox and pick up its globals.
const P={};vm.runInNewContext(readFileSync(new URL('./parse.js',import.meta.url),'utf8'),Object.assign(P,{TextDecoder,module:{}}));
const {firstUrl,isLoneUrl,decodeBody,mdToBlocks,finalize,parseDate,isKindleNotebook,kindleNotebook,kindleHighlights,mergeKindle,joinHighlights}=P.module.exports;

ok('firstUrl: bare link',firstUrl('https://example.com/a?b=1')==='https://example.com/a?b=1');
ok('firstUrl: from shared text',firstUrl('Read this: “Great essay” https://example.com/x/y.html.')==='https://example.com/x/y.html');
ok('firstUrl: drops closing bracket',firstUrl('(see https://example.com/p)')==='https://example.com/p');
ok('firstUrl: none',firstUrl('no link here')===''&&firstUrl(null)==='');
ok('isLoneUrl',isLoneUrl('  https://a.com/x \n')&&!isLoneUrl('see https://a.com')&&!isLoneUrl(''));

const sjis=new Uint8Array([0x93,0xfa,0x96,0x7b]); // 日本 in Shift_JIS
ok('decodeBody: charset from header',decodeBody(sjis.buffer,'text/html; charset=Shift_JIS')==='日本');
const meta=new TextEncoder().encode('<meta charset="utf-8"><p>Tiếng Việt</p>');
ok('decodeBody: utf-8 default and meta tag',decodeBody(meta.buffer,'text/html').includes('Tiếng Việt'));
ok('decodeBody: unknown charset falls back to utf-8',decodeBody(new TextEncoder().encode('é').buffer,'text/html; charset=bogus')==='é');

const doc=finalize(mdToBlocks('# The Quiet Engine\n\nBy Ada Rivers\n\nMarch 14, 2025\n\n'+'Most great tools start as toys. '.repeat(20)+'\n\n## Why\n\n'+'Small things win. '.repeat(20)),{});
ok('finalize: title, author, date from Markdown',doc.title==='The Quiet Engine'&&doc.author==='Ada Rivers'&&doc.writtenSort==='2025-03-14');
ok('finalize: explicit title wins (link import)',finalize(mdToBlocks('## Intro\n\n'+'Words here. '.repeat(30)),{title:'From Readability'}).title==='From Readability');
ok('parseDate: ISO and long forms',parseDate('2024-03-01T10:00:00Z')==='2024-03-01'&&parseDate('July 2023')==='2023-07-01');

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

done();
