import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ok,done} from './test-util.mjs';

// parse.js is a classic browser script; run it in a sandbox and pick up its globals.
const P={};vm.runInNewContext(readFileSync(new URL('./parse.js',import.meta.url),'utf8'),Object.assign(P,{TextDecoder,module:{}}));
const {firstUrl,isLoneUrl,decodeBody,mdToBlocks,finalize,parseDate,isKindleNotebook,kindleNotebook,kindleHighlights,mergeKindle}=P.module.exports;

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
  kshape==='h2:Part One|h3:The Keeper|p:sun|p:sky|h3:Storms|p:coral|p:sun|p:coral|h2:Part Two|h3:Storms|p:mint|p:sky');
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

done();
