// own-shelf app (formerly Upwind). Ported from legacy/app-script.js; all data goes through the store.js adapters.
import {makeLocal,makeCloud,exportShelf,importShelf} from './store.js';
import {firebaseConfig,WORKER_URL} from './config.js';
import {wordId,normTerm,termKey,sentenceAround,isDue,schedule,nextLabel,cloze,datamuseUrl,parseDatamuse,wiktionaryUrl,parseWiktionary,baseForms,isFact,factId,factCloze,wordsIn,snapWords,
  wikiSummaryUrl,parseWikiSummary,datamuseRelUrl,parseDatamuseWords,wikitextUrl,parseWikitext,cleanText,parseList,parseExamples,mergeExtras} from './vocab.js';
/* ================= utils ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);}
// A message at the bottom for about 2 s. With an action ({label, run}) a button follows it ("Moved to Trash · Undo"),
// and it stays 6 s, longer while hovered or focused. The next toast replaces it; Escape dismisses it. The button is
// never focused for you; it's the last stop in the tab order, and when it goes, focus returns to where it came from.
function toast(m,act){
  const t=$('#toast');toastBlur();
  t.classList.toggle('act',!!act);
  if(act){t.innerHTML=`${esc(m)}<span class="dot" aria-hidden="true"> · </span><button type="button">${esc(act.label)}</button>`;t.lastChild.onclick=()=>{toastOff();act.run();};}
  else t.textContent=m;
  t.classList.add('on');toastWait(act?6000:2100);
}
const toastHeld=()=>{const t=$('#toast');return t.classList.contains('act')&&(t.matches(':hover')||t.contains(document.activeElement));};
function toastWait(ms){clearTimeout(toast.t);toast.end=Date.now()+ms;if(!toastHeld())toast.t=setTimeout(toastOff,ms);}
function toastOff(){clearTimeout(toast.t);toastBlur();$('#toast').classList.remove('on');}
// focus inside the toast goes back where it came from before the toast changes or goes
function toastBlur(){const t=$('#toast');if(!t.contains(document.activeElement))return;const b=toast.back;toast.back=null;if(b&&b.isConnected&&b!==document.body)b.focus({preventScroll:true});else document.activeElement.blur();}
{
  const t=$('#toast'),hold=()=>clearTimeout(toast.t);
  const resume=()=>{if(t.classList.contains('on')&&!toastHeld())toastWait(Math.max(toast.end-Date.now(),2000));};
  t.addEventListener('mouseenter',hold);t.addEventListener('mouseleave',resume);
  t.addEventListener('focusin',e=>{if(!t.contains(e.relatedTarget))toast.back=e.relatedTarget;hold();});
  t.addEventListener('focusout',()=>setTimeout(resume));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&t.classList.contains('on'))toastOff();});
}
// Highlight colours in the toolbar's order (keys 1–5). The UI names a colour by its meaning, which the owner can rename
// in Settings (SETTINGS.meanings holds the renamed ones); chips and groups go in meaning order.
const COLORS=[['sun','Sunny'],['mint','Mint'],['coral','Coral'],['sky','Sky'],['amber','Amber']];
const MEANINGS={sky:'Important',coral:'Facts & words',amber:'Quotes',sun:'Lesser',mint:'Other'}; // the defaults, in meaning order
const BY_MEANING=Object.keys(MEANINGS);
const COLORNAME=c=>(COLORS.find(x=>x[0]===c)||[c,c])[1];
const meaning=c=>((SETTINGS.meanings||{})[c]||'').trim()||MEANINGS[c]||COLORNAME(c);
// [[colour, items]] in meaning order (any other colour last), each group keeping the order it was given.
function byColor(items){
  const g=new Map(BY_MEANING.map(c=>[c,[]]));
  items.forEach(x=>{if(!g.has(x.color)) g.set(x.color,[]);g.get(x.color).push(x);});
  return [...g].filter(([,l])=>l.length);
}
// A colour's heading when highlights are grouped by colour: swatch, meaning, count.
const colorHead=(c,n)=>`<h3 class="cgh"><i style="background:var(--${esc(c)}S)"></i>${esc(meaning(c))}<small>${n}</small></h3>`;
// cloth bindings: [cover, text]. Books store an index into this list; changing its length recolours them.
const COVERS=[['#2F5A43','#F3EAD7'],['#8E2F2A','#F8EEDD'],['#23395B','#EFE4CC'],['#B7802A','#2E2119'],['#5C3B24','#F3EAD7'],['#45706C','#F8EEDD'],['#D9C9A8','#2E2119'],['#6B3426','#F3D9B0']];
const COVER_NAMES=['Green','Oxblood','Navy','Ochre','Brown','Teal','Tan','Rust'];
// The book's binding: the colour picked in Details or at adding; books from before colours were stored hash their id.
const coverIdx=m=>m.color!=null?m.color%COVERS.length:parseInt(hash(m.id),36)%COVERS.length;
const coverOf=m=>COVERS[coverIdx(m)];
const cover=id=>coverOf(META.find(x=>x.id===id)||{id});
const fmtMonth=ms=>new Date(ms).toLocaleDateString(undefined,{month:'long',year:'numeric'});
const fmtDay=ms=>new Date(ms).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const ls={get(k,d){try{const v=localStorage.getItem('upwind:'+k);return v?JSON.parse(v):d;}catch(e){return d;}},set(k,v){try{localStorage.setItem('upwind:'+k,JSON.stringify(v));}catch(e){}}};

/* ================= storage (a store.js adapter, chosen at sign-in) ================= */
let DB=null;
let SETTINGS={}; // settings:app, e.g. {workerUrl}
let META=[];           // shelf entries
let DOC=null, ST=null; // open document + its reading state
let HL=[];
let prefs=Object.assign({size:1,theme:'auto',fmt:'md',group:'shelf',view:'shelves',sort:'added',dir:-1},ls.get('prefs',{}));
const SIZES=['1.08rem','1.22rem','1.38rem'];
function savePrefs(){ls.set('prefs',prefs);}
// Arrange by Shelf came after the others: everyone is switched to it once, then their choice is kept
if(!prefs.byShelf){prefs.byShelf=1;prefs.group='shelf';if(prefs.view==='list'){prefs.sort='shelf';prefs.dir=1;}savePrefs();}
function applyPrefs(){
  document.documentElement.style.setProperty('--fs',SIZES[prefs.size]);
  if(prefs.theme==='auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme',prefs.theme);
  document.querySelectorAll('#segFmt button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.fmt===prefs.fmt));
  document.querySelectorAll('#segGroup button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.g===prefs.group));
  document.querySelectorAll('#segView button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===prefs.view));
  document.querySelectorAll('#nbGroup button,#drGroup button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.hg===(prefs.hlGroup==='color'?'color':'off')));
}
applyPrefs();
function metaFor(doc,st){
  return {id:doc.id,title:doc.title,author:doc.author||'',written:doc.written||'',writtenSort:doc.writtenSort||'',source:doc.source||'',added:doc.added,
    color:doc.color,shelf:doc.shelf||'',words:doc.words,secs:doc.sections.length,opened:st.opened||0,progress:st.finished?1:Math.min(1,st.maxP||0),finished:!!st.finished,hl:(st.hl||[]).length};
}
async function saveMeta(){ if(!DOC) return; const m=metaFor(DOC,ST); META=META.filter(x=>x.id!==m.id).concat(m); await DB.put('meta:'+m.id,m); }
let stT;function saveState(now){clearTimeout(stT);const f=async()=>{if(!DOC)return;ST.hl=HL;await DB.put('state:'+DOC.id,ST);await saveMeta();};if(now) return f(); stT=setTimeout(f,500);}

/* ================= views ================= */
function show(view){
  $('#signin').classList.toggle('hidden',view!=='signin');
  $('#shelf').classList.toggle('hidden',view!=='shelf');
  $('#notebook').classList.toggle('hidden',view!=='notebook');
  $('#study').classList.toggle('hidden',view!=='study');
  ['#bar','#rail','#reader'].forEach(s=>$(s).classList.toggle('hidden',view!=='reader'));
  hideTool();closeDrawers();
}
async function goShelf(){
  if(DOC){ST.pos=scrollY;await saveState(true);}
  resetFind();
  DOC=null;ST=null;HL=[];show('shelf');ls.set('last',null);renderShelf();window.scrollTo(0,0);
  if(location.hash) history.replaceState(null,'',location.pathname+location.search);
}
$('#bHome').onclick=goShelf;

/* ================= shelf ================= */
// Category shelves (Arrange by Shelf), one per book. The list ([{id, name}] in order) is settings:app's `shelves`; until
// it's first changed, the starting six. A book's shelf id is on its doc and shelf entry; none, or a deleted shelf's: Unsorted ('').
const SHELVES=['Travel','Adventure','History','Finance','Fantasy','Philosophy'].map(name=>({id:name.toLowerCase(),name}));
const shelves=()=>Array.isArray(SETTINGS.shelves)?SETTINGS.shelves:SHELVES;
const shelfOf=m=>m.shelf&&shelves().some(s=>s.id===m.shelf)?m.shelf:'';
const shelfName=id=>(shelves().find(s=>s.id===id)||{name:'Unsorted'}).name;
const shelfIdx=m=>{const i=shelves().findIndex(s=>s.id===shelfOf(m));return i<0?shelves().length:i;};
// Arranged by title: shelved under the first letter, ignoring a leading "The", "A" or "An" and accents; the rest under "#".
const sortTitle=m=>nbFold(m.title).replace(/^(the|an?)\s+/,'');
function groupKey(m){
  if(prefs.group==='title'){const c=sortTitle(m)[0]||'';return /[a-z]/.test(c)?{k:c,label:c.toUpperCase()}:{k:'~',label:'#'};}
  if(prefs.group==='added') return {k:new Date(m.added).getFullYear()*100+new Date(m.added).getMonth(),label:fmtMonth(m.added)};
  if(prefs.group==='written') return m.writtenSort?{k:+m.writtenSort.slice(0,4),label:m.writtenSort.slice(0,4)}:{k:-1,label:'Undated'};
  return m.author?{k:m.author.toLowerCase(),label:m.author}:{k:'￿',label:'Unknown author'};
}
function filtered(){const q=$('#q').value.trim().toLowerCase();return META.filter(m=>!q||(m.title+' '+m.author).toLowerCase().includes(q));}
// A text's length, compact: "40 words", "4.2k words", "200k words". '' when unknown (older shelf entries have no count).
const fmtWords=w=>!(w>0)?'':w<1000?`${w} word${w===1?'':'s'}`:`${w<9950?(w/1000).toFixed(1).replace(/\.0$/,''):Math.round(w/1000)}k words`;
// The page block's thickness in px, on a log scale: ~4 at 200 words, ~30 at 150k, clamped to 3–32. Unknown → 3.
const pagesPx=w=>w>0?Math.round(Math.min(32,Math.max(3,9.04*Math.log10(w)-16.8))):3;
// A Kindle notebook (your highlights, not the book) gets a ruled-paper cover. Its id is 'k' + one hash (see readFile);
// every other id is two hashes, so in practice longer than 8 characters.
const isKindleId=id=>/^k[0-9a-z]{1,7}$/.test(id);
function bookHTML(m){
  const [bc,bt]=cover(m.id), h=186+parseInt(hash(m.id+'h'),36)%34, nb=isKindleId(m.id);
  const pct=Math.round(m.progress*100), yr=m.writtenSort?m.writtenSort.slice(0,4):'', len=fmtWords(m.words);
  return `<div class="book" style="--pg:${pagesPx(m.words)}px">
    <button class="cover${nb?' nb':''}" data-open="${m.id}" style="--bc:${bc};--bt:${bt};--h:${h}px" aria-label="${esc(m.title)}${m.author?' by '+esc(m.author):''}${nb?', Kindle notebook':''}${len?`, ${m.words.toLocaleString()} word${m.words===1?'':'s'}`:''}, ${m.finished?'finished':pct+'% read'}">
      <span class="c-t">${esc(m.title)}</span>${m.author?`<span class="c-a">${esc(m.author)}</span>`:''}${m.finished?'<span class="c-done">✓ Finished</span>':''}${len?`<span class="c-l">${len}</span>`:''}
      <span class="c-f"><span>${yr}</span><span>${m.hl?`✎ ${m.hl}`:''}${pct&&!m.finished?` · ${pct}%`:''}</span></span>
      <span class="c-p"><i style="width:${pct}%"></i></span></button><span class="pages" aria-hidden="true"></span>
    <button class="c-more" data-edit="${m.id}" aria-label="Details for ${esc(m.title)}">⋯</button></div>`;
}
function renderShelf(){
  const all=META;
  const hl=all.reduce((a,m)=>a+m.hl,0), fin=all.filter(m=>m.finished).length;
  $('#stats').innerHTML=all.length?`<b>${all.length}</b> ${all.length===1?'text':'texts'} · <b>${hl}</b> highlights · <b>${fin}</b> finished`:'Nothing here yet';
  $('#ctrl').classList.toggle('hidden',!all.length);
  const cont=[...all].filter(m=>!m.finished&&m.progress>0.01).sort((a,b)=>b.opened-a.opened)[0];
  $('#contWrap').innerHTML=cont?`<div class="cont"><span class="cv" style="background:${cover(cont.id)[0]}"></span><div class="ct"><small>Continue reading</small><b>${esc(cont.title)}</b><span>${Math.round(cont.progress*100)}%${cont.words?` · about ${Math.max(1,Math.round(cont.words*(1-cont.progress)/230))} min left`:''}</span></div><button class="btn" data-open="${cont.id}">Continue</button></div>`:'';
  const body=$('#shelfBody');
  if(!all.length){
    body.innerHTML=`<div class="empty-shelf"><img src="icons/mark.svg" alt=""><h2>An empty shelf, for now.</h2><p>Add a PDF, a text file, or paste any article. It lands here as a book you can read, highlight and come back to.</p><button class="btn sea" data-add>Add your first text</button></div>`;
    return;
  }
  const list=filtered();
  if(!list.length){body.innerHTML=`<div class="empty">Nothing on the shelf matches “${esc($('#q').value)}”.</div>`;return;}
  if(prefs.view==='list'){
    const cols=[['title','Title'],['author','Author'],['shelf','Shelf'],['written','Written'],['words','Length'],['added','Added'],['progress','Progress'],['hl','Highlights']];
    const val=(m,c)=>c==='written'?(m.writtenSort||''):c==='title'?sortTitle(m):c==='author'?(m.author||'￿').toLowerCase():c==='words'?(m.words||0):c==='shelf'?shelfIdx(m):m[c];
    // by shelf: in shelf order, Unsorted last, newest added first within a shelf
    const rows=[...list].sort((a,b)=>{const A=val(a,prefs.sort),B=val(b,prefs.sort);return (A<B?-1:A>B?1:0)*prefs.dir||(prefs.sort==='shelf'?b.added-a.added:0);});
    body.innerHTML=`<table class="tbl${prefs.sort==='shelf'?' by-shelf':''}"><thead><tr>${cols.map(([c,l])=>`<th class="c-${c}"><button data-sort="${c}" aria-sort="${prefs.sort===c?(prefs.dir>0?'ascending':'descending'):'none'}">${l}${prefs.sort===c?(prefs.dir>0?' ↑':' ↓'):''}</button></th>`).join('')}</tr></thead><tbody>${
      rows.map(m=>`<tr data-open="${m.id}" tabindex="0"><td><span class="tt">${isKindleId(m.id)?'<i class="nb"></i>':`<i style="background:${cover(m.id)[0]}"></i>`}${esc(m.title)}</span></td><td class="mut">${esc(m.author||'—')}</td><td class="mut c-shelf">${esc(shelfName(shelfOf(m)))}</td><td class="mut c-written">${esc(m.written||'—')}</td><td class="mut c-words">${fmtWords(m.words)||'—'}</td><td class="mut c-added">${fmtDay(m.added)}</td><td>${m.finished?'Finished':`<span class="pbar"><i style="width:${Math.round(m.progress*100)}%"></i></span>${Math.round(m.progress*100)}%`}</td><td class="mut c-hl">${m.hl}</td></tr>`).join('')}</tbody></table>`;
    return;
  }
  if(prefs.group==='shelf'){body.innerHTML=shelfRows(list);return;}
  const groups=new Map();
  list.forEach(m=>{const g=groupKey(m);if(!groups.has(g.label))groups.set(g.label,{k:g.k,items:[]});groups.get(g.label).items.push(m);});
  const ord=[...groups.entries()].sort((a,b)=>{const A=a[1].k,B=b[1].k;if(prefs.group==='author'||prefs.group==='title') return A<B?-1:A>B?1:0; return B-A;});
  const inner=m=>prefs.group==='added'?-m.added:prefs.group==='written'?-(+(m.writtenSort||'0').replace(/-/g,'')):-(+(m.writtenSort||'0').replace(/-/g,''));
  body.innerHTML=ord.map(([label,g])=>`<section class="shelf-row"><h3 class="shelf-label">${esc(label)}<small>${g.items.length}</small></h3><div class="books">${g.items.sort(prefs.group==='title'?(a,b)=>sortTitle(a).localeCompare(sortTitle(b)):(a,b)=>inner(a)-inner(b)).map(bookHTML).join('')}</div><div class="plank"></div></section>`).join('');
}
// Arranged by shelf: every shelf in order, then Unsorted (only when it has books). While searching, only shelves with a match.
function shelfRows(list){
  const q=!!$('#q').value.trim(),all=[...shelves(),{id:'',name:'Unsorted'}],by=new Map(all.map(s=>[s.id,[]]));
  list.forEach(m=>by.get(shelfOf(m)).push(m));
  return all.map(s=>{const l=by.get(s.id).sort((a,b)=>b.added-a.added);if(!l.length&&(q||!s.id)) return '';
    return `<section class="shelf-row${l.length?'':' bare'}" data-shelf="${esc(s.id)}"><h3 class="shelf-label">${s.id?`<button class="sl-name" data-shelf-edit="${esc(s.id)}" aria-label="${esc(s.name)}: rename, move or delete">${esc(s.name)}</button>`:'Unsorted'}${l.length?`<small>${l.length}</small>`:''}</h3>`+
      `<div class="books">${l.length?l.map(bookHTML).join(''):'<p class="sl-hint">Drag books here</p>'}</div><div class="plank"></div></section>`;}).join('')+
    (q?'':'<button class="btn ghost sl-new" data-shelf-new>+ New shelf</button>');
}
$('#shelf').addEventListener('click',e=>{
  const o=e.target.closest('[data-open]'); if(o){openBook(o.dataset.open);return;}
  const ed=e.target.closest('[data-edit]'); if(ed){openDetails(ed.dataset.edit);return;}
  if(e.target.closest('[data-add]')){openImport();return;}
  const se=e.target.closest('[data-shelf-edit]'); if(se){openShelf(se.dataset.shelfEdit);return;}
  if(e.target.closest('[data-shelf-new]')){openShelf(null);return;}
  const s=e.target.closest('[data-sort]'); if(s){const c=s.dataset.sort;if(prefs.sort===c) prefs.dir*=-1; else {prefs.sort=c;prefs.dir=['title','author','shelf'].includes(c)?1:-1;}savePrefs();renderShelf();}
});
$('#shelf').addEventListener('keydown',e=>{if(e.key==='Enter'){const r=e.target.closest('tr[data-open]');if(r) openBook(r.dataset.open);}});
$('#segGroup').onclick=e=>{const b=e.target.closest('button');if(!b)return;prefs.group=b.dataset.g;if(prefs.view==='list'){prefs.sort=prefs.group;prefs.dir=['author','title','shelf'].includes(prefs.group)?1:-1;}savePrefs();applyPrefs();renderShelf();};
$('#segView').onclick=e=>{const b=e.target.closest('button');if(!b)return;prefs.view=b.dataset.v;savePrefs();applyPrefs();renderShelf();};
$('#q').oninput=renderShelf;
$('#addBtn').onclick=()=>openImport();

/* ================= shelves: moving books, managing the list ================= */
// A book onto another shelf: its shelf entry at once, then its doc, in a queue so quick moves land in order.
let shelfQ=Promise.resolve();
function moveBook(id,shelf){
  const m=META.find(x=>x.id===id);if(!m||shelfOf(m)===shelf) return;
  const nm={...m,shelf};META=META.map(x=>x===m?nm:x);DB.put('meta:'+id,nm);renderShelf();toast(`Moved to ${shelfName(shelf)}`);
  shelfQ=shelfQ.then(async()=>{const d=DOC&&DOC.id===id?DOC:await DB.get('doc:'+id);if(d){d.shelf=shelf;await DB.put('doc:'+id,d);}}).catch(e=>console.error(e));
}
// The list changes on this device and is written once (settings:app goes straight to Firestore). Books keep their
// shelf ids: a deleted shelf's books show under Unsorted without a write each.
function saveShelves(l){SETTINGS={...SETTINGS,shelves:l};DB.put('settings:app',SETTINGS);renderShelf();}
// The shelf dialog: a new shelf (id null), or rename, move or delete one
let shId=null;
const shErr=m=>{$('#shErr').textContent=m||'';$('#shErr').classList.toggle('hidden',!m);};
function openShelf(id){
  const s=shelves().find(x=>x.id===id);shId=s?id:null;
  $('#shH').textContent=s?'Shelf':'New shelf';$('#shName').value=s?s.name:'';$('#shSave').textContent=s?'Save':'Add shelf';
  ['#shSub','#shMove','#shDel'].forEach(x=>$(x).classList.toggle('hidden',!s));shErr('');shMoves();openModal('#shelfM');
  if(!s) $('#shName').focus();
}
function shMoves(){const l=shelves(),i=l.findIndex(s=>s.id===shId);$('#shUp').disabled=i<=0;$('#shDown').disabled=i<0||i===l.length-1;}
const shMove=by=>{const l=[...shelves()],i=l.findIndex(s=>s.id===shId),j=i+by;if(i<0||j<0||j>=l.length) return;[l[i],l[j]]=[l[j],l[i]];saveShelves(l);shMoves();};
$('#shUp').onclick=()=>shMove(-1);
$('#shDown').onclick=()=>shMove(1);
$('#shSave').onclick=()=>{
  const name=$('#shName').value.trim().replace(/\s+/g,' '),l=shelves(),s=l.find(x=>x.id===shId);
  if(!name){shErr('Give the shelf a name.');return;}
  if(name.toLowerCase()==='unsorted'||l.some(x=>x.id!==shId&&x.name.toLowerCase()===name.toLowerCase())){shErr(`There’s already a shelf called ${name}.`);return;}
  closeModal('#shelfM');if(s&&s.name===name) return;
  if(s){saveShelves(l.map(x=>x===s?{...x,name}:x));return;}
  const id='s'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);saveShelves([...l,{id,name}]);
  const row=document.querySelector(`#shelfBody [data-shelf="${id}"]`);if(row) row.scrollIntoView({block:'nearest',behavior:'smooth'});
};
$('#shName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#shSave').click();}});
// nothing is lost (the books go to Unsorted), so a second tap instead of a typed "yes"
$('#shDel').onclick=e=>{
  const s=shelves().find(x=>x.id===shId);if(!s||!armed(e.currentTarget,'Tap again to delete')) return;
  const n=META.filter(m=>m.shelf===s.id).length;saveShelves(shelves().filter(x=>x!==s));closeModal('#shelfM');
  toast(n?`Deleted ${s.name} · ${plural(n,'book')} in Unsorted`:`Deleted ${s.name}`);
};

// Dragging a cover onto another shelf (Arrange by Shelf, Shelves view). Mouse: press and drag. Touch: hold ~400 ms,
// then drag; moving sooner is a scroll, and a tap still opens the book. The shelf under the pointer lights up; near the
// window's top or bottom edge the page scrolls. Touch uses touch events: preventing touchmove is what stops iOS scrolling.
let DRAG=null,dragClick=false;
const dragOn=()=>prefs.group==='shelf'&&prefs.view==='shelves';
function dragStart(c,x,y,touch,pid){
  const m=META.find(b=>b.id===c.dataset.open);if(!m) return;
  DRAG={id:m.id,from:shelfOf(m),book:c.parentElement,touch,pid,x,y,cx:x,cy:y};
  if(touch) DRAG.hold=setTimeout(liftBook,400);
}
// → true while a book is lifted (then the move is the drag's, not the page's)
function dragTo(x,y){
  const d=DRAG;d.cx=x;d.cy=y;
  if(d.ghost){placeGhost();return true;}
  if(Math.hypot(x-d.x,y-d.y)>8){if(d.touch) dragStop(false); else liftBook();}
  return !!(DRAG&&DRAG.ghost);
}
function liftBook(){
  const d=DRAG;if(!d||d.ghost) return;clearTimeout(d.hold);
  const r=d.book.getBoundingClientRect(),g=d.ghost=d.book.cloneNode(true);d.dx=d.x-r.left;d.dy=d.y-r.top;
  g.querySelectorAll('.c-more').forEach(x=>x.remove());g.querySelectorAll('[data-open]').forEach(x=>x.removeAttribute('data-open'));
  g.classList.add('drag-ghost');g.setAttribute('aria-hidden','true');document.body.appendChild(g);
  d.book.classList.add('lifted');document.body.classList.add('dragging');getSelection().removeAllRanges();
  placeGhost();d.raf=requestAnimationFrame(dragScroll);
}
function placeGhost(){
  const d=DRAG;d.ghost.style.transform=`translate(${d.cx-d.dx}px,${d.cy-d.dy}px) rotate(-2deg)`;
  const el=document.elementFromPoint(d.cx,d.cy),row=el&&el.closest('#shelfBody .shelf-row'),to=row&&row.dataset.shelf!==d.from?row:null;
  if(to!==d.over){if(d.over) d.over.classList.remove('drop');d.over=to;if(to) to.classList.add('drop');}
}
// up to 16 px a frame, faster the closer to the edge
function dragScroll(){
  const d=DRAG;if(!d||!d.ghost) return;
  const E=70,v=d.cy<E?d.cy-E:d.cy>innerHeight-E?d.cy-innerHeight+E:0;
  if(v){scrollBy(0,Math.round(16*Math.max(-1,Math.min(1,v/E))));placeGhost();}
  d.raf=requestAnimationFrame(dragScroll);
}
function dragStop(drop){
  const d=DRAG;DRAG=null;if(!d) return;clearTimeout(d.hold);if(!d.ghost) return;
  cancelAnimationFrame(d.raf);d.ghost.remove();d.book.classList.remove('lifted');document.body.classList.remove('dragging');dragClick=true;
  if(d.over){d.over.classList.remove('drop');if(drop) moveBook(d.id,d.over.dataset.shelf);}
}
const shelfBody=$('#shelfBody');
shelfBody.addEventListener('pointerdown',e=>{const c=e.target.closest('.cover');if(c&&e.pointerType==='mouse'&&!e.button&&!DRAG&&dragOn()) dragStart(c,e.clientX,e.clientY,false);});
addEventListener('pointermove',e=>{if(DRAG&&!DRAG.touch&&e.pointerType==='mouse'){if(e.buttons&1) dragTo(e.clientX,e.clientY); else dragStop(false);}}); // released outside the window: no drop
addEventListener('pointerup',e=>{if(DRAG&&!DRAG.touch&&e.pointerType==='mouse') dragStop(true);});
shelfBody.addEventListener('touchstart',e=>{
  if(DRAG){dragStop(false);return;} // a second finger: a pinch, not a drag
  const c=e.target.closest('.cover'),p=e.changedTouches[0];if(c&&e.touches.length===1&&dragOn()) dragStart(c,p.clientX,p.clientY,true,p.identifier);
},{passive:true});
const myTouch=e=>DRAG&&DRAG.touch&&[...e.changedTouches].find(p=>p.identifier===DRAG.pid);
document.addEventListener('touchmove',e=>{
  const p=myTouch(e);if(!p) return;
  if(!e.cancelable&&!DRAG.ghost){dragStop(false);return;} // the browser is already scrolling
  if(dragTo(p.clientX,p.clientY)) e.preventDefault();
},{passive:false});
document.addEventListener('touchend',e=>{if(myTouch(e)) dragStop(true);});
document.addEventListener('touchcancel',e=>{if(myTouch(e)) dragStop(false);});
addEventListener('keydown',e=>{if(e.key==='Escape'&&DRAG) dragStop(false);});
addEventListener('blur',()=>{if(DRAG) dragStop(false);});
shelfBody.addEventListener('contextmenu',e=>{if(DRAG) e.preventDefault();}); // Android's long-press menu
// the click that ends a drag doesn't open the book; the next press or key starts afresh
['pointerdown','keydown'].forEach(t=>addEventListener(t,()=>{dragClick=false;},true));
$('#shelf').addEventListener('click',e=>{if(dragClick){dragClick=false;e.stopPropagation();e.preventDefault();}},true);

/* ================= import ================= */
let pending=null; // {name, blocks, hint, author, source}
function openModal(id){$(id).classList.remove('hidden');}
function closeModal(id){$(id).classList.add('hidden');}
document.querySelectorAll('.modal').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-cancel]')) closeModal('#'+m.id);});});
function openImport(file){
  pending=null;$('#paste').innerHTML='';$('#link').value='';$('#paste').classList.add('empty');['#fTitle','#fAuthor','#fWritten'].forEach(s=>{$(s).value='';});
  $('#fTitle').placeholder='Detected automatically';$('#fAuthor').placeholder='Optional';$('#fWritten').placeholder='e.g. July 2023';
  $('#det').textContent='';$('#impErr').classList.add('hidden');renderPending();openModal('#importM');
  if(file) loadFile(file); else setTimeout(()=>$('#paste').focus(),50);
}
$('#pickFile').onclick=()=>$('#file').click();
// One file goes through the review step; several go straight to the shelf.
const addFiles=fs=>{if(fs.length===1) loadFile(fs[0]); else if(fs.length) addMany(fs);};
$('#file').onchange=e=>{const fs=[...e.target.files];e.target.value='';addFiles(fs);};
const dz=$('#dz');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over');}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over');}));
dz.addEventListener('drop',e=>{e.stopPropagation();addFiles([...e.dataTransfer.files]);});
function renderPending(){
  $('#dzHint').innerHTML=pending?`<span class="chipf">${esc(pending.name)}<button aria-label="Remove file" id="rmFile">✕</button></span>`:'PDF, .txt, .md, .html or a Kindle notebook — or drop them here';
  if(pending) $('#rmFile').onclick=()=>{pending=null;renderPending();detect();};
}
const nameTitle=n=>n.replace(/\.[^.]+$/,'').replace(/^\d{6,}_/,'').replace(/[_-]+/g,' ').trim();
async function pdfBlocks(file){
  if(!window.pdfjsLib) throw new Error('pdf.js missing');
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  const pages=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);pages.push((await pg.getTextContent()).items);}
  let info={};try{info=(await pdf.getMetadata()).info||{};}catch(e){}
  const L=linesFromPages(pages);const blocks=blocksFromLines(L.lines);
  if(blocks.length<2) throw new Error('no text');
  const mt=(info.Title||'').trim();const okT=mt&&!/^(untitled|microsoft word|document\d*|.*\.(pdf|docx?))$/i.test(mt)&&mt.length<160;
  return {blocks,hint:okT?mt:(L.titleHint||nameTitle(file.name)),author:(info.Author||'').trim().length<80?(info.Author||'').trim():'',source:L.source};
}
// A file → {blocks, hint, author, source, …}. A Kindle notebook export also sets `kindle`, the book's id: it comes from
// the export's own title and author, so a newer export of the same book merges into it.
async function readFile(f){
  if(/\.pdf$/i.test(f.name)||f.type==='application/pdf') return pdfBlocks(f);
  const t=await f.text();
  if(isKindleNotebook(t)){const k=kindleNotebook(t);return {blocks:k.blocks,title:k.title,hint:k.title,author:k.author,source:'',kindle:'k'+hash((k.title+'|'+k.author).toLowerCase())};}
  return {blocks:/\.html?$/i.test(f.name)||/^\s*</.test(t)?htmlToBlocks(t):mdToBlocks(t),hint:nameTitle(f.name),author:'',source:''};
}
async function loadFile(f){
  $('#impErr').classList.add('hidden');$('#dzHint').textContent='Reading '+f.name+'…';
  try{pending=Object.assign({name:f.name},await readFile(f));}
  catch(e){console.error(e);pending=null;impErr(/pdf\.js/.test(e.message)?"The PDF reader didn't load. Try again, or paste the text instead.":"Couldn't read any text from that file. If it's a scanned PDF, paste the text instead.");}
  renderPending();detect();
}
// The source plus whatever the review step's fields override → a finalized doc, or an error message.
function finalizeSource(s,o){
  const d=finalize(s.blocks,Object.assign({title:s.title,hint:s.hint,author:s.author,written:s.written,source:s.source,verbatim:!!s.kindle},o));
  if(s.kindle){if(!d.blocks.some(b=>b.kh)) return {err:'That Kindle notebook has no highlights.'};d.id=s.kindle;}
  else if(d.words<20&&!d.blocks.some(b=>b.t==='img')) return {err:'That looks too short to read — paste the full text.'};
  return {d};
}
const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
async function addMany(files){
  $('#impErr').classList.add('hidden');toast(`Adding ${plural(files.length,'file')}…`);
  const n={added:0,merged:0,same:0,failed:0};
  for(const [i,f] of files.entries()){
    $('#dzHint').textContent=`Adding ${i+1} of ${files.length}…`;
    try{const s=await readFile(f),{d}=finalizeSource(s);if(!d){n.failed++;continue;}n[await addDoc(d,{kindle:!!s.kindle,quiet:true})]++;}
    catch(e){console.error(e);n.failed++;}
  }
  closeModal('#importM');renderPending();if(!DOC) renderShelf();
  const msg=[n.added&&`added ${plural(n.added,'book')}`,n.merged&&`merged ${n.merged}`,n.same&&`${n.same} already on the shelf`,n.failed&&`${n.failed} couldn't be read`].filter(Boolean).join(' · ');
  toast(msg[0].toUpperCase()+msg.slice(1));
}
function impErr(m){const e=$('#impErr');e.textContent=m;e.classList.remove('hidden');}
// rich paste
const pasteBox=$('#paste');
function blocksToHTML(blocks){
  let h='';const stack=[];
  const close=d=>{while(stack.length>d)h+='</li></'+stack.pop()+'>';};
  blocks.forEach(b=>{
    if(b.t==='li'){
      const d=b.depth||0;
      close(d+1);
      if(stack.length===d+1&&stack[d]!==b.list) close(d);
      if(stack.length===d+1) h+='</li><li>'; else while(stack.length<d+1){h+=`<${b.list}><li>`;stack.push(b.list);}
      h+=inlineHTML(b,true);return;
    }
    close(0);
    if(b.t==='h') h+=`<h${b.level||2}>${inlineHTML(b,true)}</h${b.level||2}>`;
    else if(b.t==='quote') h+=`<blockquote><p>${inlineHTML(b,true)}</p></blockquote>`;
    else if(b.t==='code') h+=`<pre>${esc(b.text)}</pre>`;
    else if(b.t==='img') h+=`<figure><img src="${esc(b.src)}" alt="${esc(b.alt||'')}">${b.caption?`<figcaption>${esc(b.caption)}</figcaption>`:''}</figure>`;
    else if(b.t==='hr') h+='<hr>';
    else h+=`<p>${inlineHTML(b,true)}</p>`;
  });
  close(0);return h;
}
// ≤1400 px; a data URL over ~600 KB is redone at 1000 px / 0.7 so one image never breaks a 700 KB storage chunk
function shrinkImage(file){return new Promise(res=>{const fr=new FileReader();fr.onload=()=>{const img=new Image();img.onload=()=>{const draw=(max,q)=>{const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',q);};let u=draw(1400,.85);if(u.length>600*1024)u=draw(1000,.7);res(u);};img.onerror=()=>res(null);img.src=fr.result;};fr.readAsDataURL(file);});}
function insertAtCaret(html){
  const sel=getSelection();let r=sel.rangeCount?sel.getRangeAt(0):null;
  if(!r||!pasteBox.contains(r.commonAncestorContainer)){r=document.createRange();r.selectNodeContents(pasteBox);r.collapse(false);}
  r.deleteContents();const frag=r.createContextualFragment(html);const last=frag.lastChild;r.insertNode(frag);
  if(last){const r2=document.createRange();r2.setStartAfter(last);r2.collapse(true);sel.removeAllRanges();sel.addRange(r2);}
}
async function insertClip(html,txt,imgs){
  let out='';
  if(html&&html.trim()) out=blocksToHTML(htmlToBlocks(html));
  else if(txt) out=blocksToHTML(mdToBlocks(txt));
  if(!out.trim()||(!html&&imgs.length)) for(const f of imgs){const u=await shrinkImage(f);if(u) out+=`<figure><img src="${u}" alt=""></figure>`;}
  if(out) insertAtCaret(out);
  pasteBox.classList.toggle('empty',!pasteBox.textContent.trim()&&!pasteBox.querySelector('img'));
  detect();
}
pasteBox.addEventListener('paste',async e=>{
  const cd=e.clipboardData;if(!cd) return;
  e.preventDefault();
  const html=cd.getData('text/html'),txt=cd.getData('text/plain');
  if(isLoneUrl(txt)&&canImportLinks()){$('#link').value=txt.trim();importLink(txt);return;}
  await insertClip(html,txt,[...(cd.files||[])].filter(f=>/^image\//.test(f.type)));
});
pasteBox.addEventListener('input',()=>{pasteBox.classList.toggle('empty',!pasteBox.textContent.trim()&&!pasteBox.querySelector('img'));clearTimeout(detect.t);detect.t=setTimeout(detect,500);});
function currentSource(){
  if(pending) return pending;
  if(!pasteBox.textContent.trim()&&!pasteBox.querySelector('img')) return null;
  return {blocks:htmlToBlocks(pasteBox.innerHTML),hint:'',author:'',source:''};
}
function detect(){
  const s=currentSource();const det=$('#det');
  if(!s){det.textContent='';$('#fTitle').placeholder='Detected automatically';return;}
  const d=finalize(s.blocks,{title:s.title,hint:s.hint,author:s.author,written:s.written,source:s.source,verbatim:!!s.kindle});
  const c={li:0,img:0,h:0};d.blocks.forEach(b=>{if(c[b.t]!==undefined)c[b.t]++;});const kh=d.blocks.filter(b=>b.kh).length;
  det.innerHTML=`Found <b>${esc(d.title)}</b>${d.author?` by <b>${esc(d.author)}</b>`:''}${d.written?`, written <b>${esc(d.written)}</b>`:''} · ${d.words.toLocaleString()} words · ${d.sections.length} section${d.sections.length===1?'':'s'}${c.li?` · ${c.li} list items`:''}${c.img?` · ${c.img} image${c.img>1?'s':''}`:''}${d.notes.length?` · ${d.notes.length} notes`:''}${kh?` · ${plural(kh,'Kindle highlight')}`:''}`;
  $('#fTitle').placeholder=d.title;$('#fAuthor').placeholder=d.author||'Optional';$('#fWritten').placeholder=d.written||'e.g. July 2023';
}
$('#impGo').onclick=async()=>{
  const s=currentSource();
  if(!s){impErr('Choose a file or paste something first.');return;}
  const {d,err}=finalizeSource(s,{title:$('#fTitle').value.trim()||s.title,author:$('#fAuthor').value.trim()||s.author,written:$('#fWritten').value.trim()||s.written});
  if(err){impErr(err);return;}
  await addDoc(d,{kindle:!!s.kindle});closeModal('#importM');
};
// Adds a finalized doc and opens it (quiet: neither opens nor toasts, for a batch). A Kindle notebook's kh blocks become
// its highlights, and a newer export of a Kindle book on the shelf merges into it. → 'added', 'merged' or 'same'.
async function addDoc(d,{kindle,quiet}={}){
  const hl=kindleHighlights(d,Date.now());
  d.id=d.id||hash(JSON.stringify(d.blocks.map(b=>b.text||b.src)).slice(0,200000))+hash(d.title);
  if(META.some(m=>m.id===d.id)){
    const r=kindle?await mergeInto(d,hl,quiet):null;
    if(!quiet){toast(r?`Merged: ${plural(r.added,'new highlight')}${r.dropped?` · ${r.dropped} no longer in the notebook`:''}${Object.entries(r.recoloured).map(([c,n])=>` · ${n} moved to ${meaning(c)}`).join('')}`:kindle?'No new highlights — opening it':'Already on your shelf — opening it');openBook(d.id);}
    return r?'merged':'same';
  }
  d.added=Date.now();
  const used=META.slice().sort((a,b)=>b.added-a.added).slice(0,3).map(m=>m.color);let c=META.length%COVERS.length;while(used.includes(c))c=(c+1)%COVERS.length;d.color=c;
  const st={hl,pos:0,maxP:0,done:[],opened:Date.now()};
  await DB.put('doc:'+d.id,d);await DB.put('state:'+d.id,st);const m=metaFor(d,st);await DB.put('meta:'+d.id,m);META.push(m);
  untrashBook(d.id); // the same text added again while its old copy is in the Trash
  if(!quiet) openBook(d.id);
  return 'added';
}
// A newer export of a Kindle book on the shelf: the book is rebuilt from it and keeps its highlights (see mergeKindle)
// and what Details can edit. → {added, dropped, recoloured}, or null when the export holds nothing new. An open book is reloaded.
async function mergeInto(d,hl,quiet){
  const id=d.id,open=!!(DOC&&DOC.id===id);
  if(open){ST.pos=scrollY;await saveState(true);}
  const old=open?DOC:await DB.get('doc:'+id),st=(open?ST:await DB.get('state:'+id))||{hl:[],pos:0,maxP:0,done:[]};
  const r=old?mergeKindle(old,st.hl||[],d,hl):{hl,added:hl.length,dropped:0,recoloured:{}};
  if(r.same) return null;
  if(old) ['added','color','shelf','title','author','written','writtenSort','source'].forEach(k=>{d[k]=old[k];}); else d.added=Date.now();
  st.hl=r.hl;
  await DB.put('doc:'+id,d);await DB.put('state:'+id,st);const m=metaFor(d,st);META=META.filter(x=>x.id!==id).concat(m);await DB.put('meta:'+id,m);
  if(open&&quiet) await openBook(id);
  return {added:r.added,dropped:r.dropped,recoloured:r.recoloured};
}
// drop anywhere; on a word or fact card (the word card, the Words tab), a picture goes to that card (addPics)
let dragDepth=0;
const picHost=t=>{const el=t&&(t.nodeType===1?t:t.parentElement);return el?el.closest('#wordBox:not(.hidden),#wdList .wcard[data-id]'):null;};
const picOver=h=>document.querySelectorAll('.pic-over').forEach(x=>{if(x!==h) x.classList.remove('pic-over');});
addEventListener('dragenter',e=>{
  if(!(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')&&$('#importM').classList.contains('hidden'))) return;
  const h=picHost(e.target);dragDepth++;$('#dropAll').classList.toggle('on',!h);picOver(h);if(h) h.classList.add('pic-over');
});
addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth){$('#dropAll').classList.remove('on');picOver();}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#dropAll').classList.remove('on');picOver();const fs=[...((e.dataTransfer&&e.dataTransfer.files)||[])];
  const h=picHost(e.target);if(h){if(fs.length) addPics(h.id==='wordBox'?CARD&&CARD.id:h.dataset.id,fs);return;}
  if(!fs.length||!$('#importM').classList.contains('hidden')) return;if(fs.length>1) addMany(fs); else openImport(fs[0]);});

/* ================= details ================= */
let detId=null;
async function openDetails(id){
  detId=id;const m=META.find(x=>x.id===id);if(!m)return;
  $('#dTitle').value=m.title;$('#dAuthor').value=m.author;$('#dWritten').value=m.written;$('#dSource').value=m.source;renderDone(m);
  // a Kindle notebook keeps its ruled-paper cover, so it has no binding to pick
  $('#dCoverRow').classList.toggle('hidden',isKindleId(id));
  $('#dCover').innerHTML=COVERS.map(([bc],i)=>`<button type="button" class="cv-sw" data-c="${i}" aria-pressed="${i===coverIdx(m)}" aria-label="${COVER_NAMES[i]}" title="${COVER_NAMES[i]}" style="--c:${bc}"></button>`).join('');
  $('#dShelf').innerHTML=[...shelves(),{id:'',name:'Unsorted'}].map(s=>`<option value="${esc(s.id)}"${s.id===shelfOf(m)?' selected':''}>${esc(s.name)}</option>`).join('');
  openModal('#detM');
}
$('#dCover').onclick=e=>{const b=e.target.closest('[data-c]');if(b) $('#dCover').querySelectorAll('[data-c]').forEach(x=>x.setAttribute('aria-pressed',x===b));};
function renderDone(m){
  $('#dState').textContent=m.finished?'✓ Finished':`Reading · ${Math.round(m.progress*100)}%`;
  $('#dFinish').textContent=m.finished?'Mark as reading':'Mark as finished';
}
// A manual override of the automatic finish. Mark as finished: done, at 100%. Mark as reading: progress goes back to
// the share of sections you'd reached, and finishing on its own again needs fresh reading time.
$('#dFinish').onclick=async()=>{
  const id=detId,m=META.find(x=>x.id===id),open=!!(DOC&&DOC.id===id),d=open?DOC:await DB.get('doc:'+id);if(!d||!m)return;
  const st=open?ST:((await DB.get('state:'+id))||{hl:[],pos:0,maxP:0,done:[]}),fin=!m.finished;
  if(fin){st.finished=true;st.maxP=1;}
  else{st.finished=false;st.readMs=0;st.maxP=Math.min(.99,(st.done||[]).length/Math.max(1,(d.sections||[]).length));}
  if(open){await saveState(true);onScroll();}
  else{await DB.put('state:'+id,st);const nm=metaFor(d,st);META=META.filter(x=>x.id!==id).concat(nm);await DB.put('meta:'+id,nm);renderShelf();}
  renderDone(META.find(x=>x.id===id));toast(fin?'Marked as finished':'Marked as reading');
};
$('#dSave').onclick=async()=>{
  const d=DOC&&DOC.id===detId?DOC:await DB.get('doc:'+detId);if(!d)return;
  d.title=$('#dTitle').value.trim()||d.title;d.author=$('#dAuthor').value.trim();d.written=$('#dWritten').value.trim();d.writtenSort=parseDate(d.written);
  const src=$('#dSource').value.trim();d.source=/^https?:\/\//i.test(src)?src:'';
  const pick=$('#dCover [aria-pressed="true"]');if(pick&&!isKindleId(d.id)) d.color=+pick.dataset.c;
  d.shelf=$('#dShelf').value;
  await DB.put('doc:'+d.id,d);
  const st=DOC&&DOC.id===d.id?ST:(await DB.get('state:'+d.id))||{hl:[]};
  const m=metaFor(d,st);META=META.filter(x=>x.id!==m.id).concat(m);await DB.put('meta:'+m.id,m);
  closeModal('#detM');toast('Details saved');
  if(DOC&&DOC.id===d.id){DOC=d;buildReader();} else renderShelf();
};
function armed(btn,label){
  if(btn.dataset.armed){clearTimeout(+btn.dataset.armed);delete btn.dataset.armed;btn.textContent=btn.dataset.orig;return true;}
  btn.dataset.orig=btn.textContent;btn.textContent=label;
  btn.dataset.armed=setTimeout(()=>{btn.textContent=btn.dataset.orig;delete btn.dataset.armed;},3500);return false;
}
// Deleting highlights or notes needs "yes" typed in a dialog; resolves true only then. plain: a change that deletes
// nothing asks the same question without the typing, and its button isn't red.
let cfDone=null,cfPlain=false;
const cfOk=()=>cfPlain||$('#cfInput').value.trim().toLowerCase()==='yes';
function confirmTyped(title,body,label,plain=false){
  return new Promise(res=>{
    cfPlain=plain;
    $('#cfH').textContent=title;$('#cfBody').textContent=body;$('#cfGo').textContent=label;$('#cfInput').value='';$('#cfGo').disabled=!plain;
    $('#cfInput').closest('label').classList.toggle('hidden',plain);$('#cfGo').classList.toggle('danger',!plain);$('#cfGo').classList.toggle('sea',plain);
    cfDone=v=>{cfDone=null;closeModal('#confirmM');res(v);};
    openModal('#confirmM');(plain?$('#cfGo'):$('#cfInput')).focus(); // synchronous, so iOS opens the keyboard when this runs from a tap
  });
}
$('#cfInput').addEventListener('input',()=>{$('#cfGo').disabled=!cfOk();});
$('#cfInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&cfOk()&&cfDone){e.preventDefault();cfDone(true);}});
$('#cfGo').onclick=()=>{if(cfOk()&&cfDone)cfDone(true);};
// Cancel, a tap outside or Escape all hide the dialog: that answers no
new MutationObserver(()=>{if($('#confirmM').classList.contains('hidden')&&cfDone)cfDone(false);}).observe($('#confirmM'),{attributes:true,attributeFilter:['class']});
const lossText=(n,nn)=>`${n} highlight${n===1?'':'s'}${nn?` and ${nn} note${nn===1?'':'s'}`:''}`;
const TRASH_NOTE='They go to the Trash, where you can restore them for 30 days.';
// A soft delete: only the shelf entry goes. The book and its reading state stay until the Trash lets go of them.
$('#dRemove').onclick=async e=>{
  const id=detId,m=META.find(x=>x.id===id);if(!m)return;
  const open=!!(DOC&&DOC.id===id),hl=open?HL:m.hl?(((await DB.get('state:'+id))||{}).hl||[]):[];
  if(m.hl){
    if(!await confirmTyped('Remove this book?',`This removes “${m.title}” and its ${lossText(hl.length||m.hl,hl.filter(h=>h.note).length)}. ${TRASH_NOTE}`,'Remove book'))return;
  } else if(!armed(e.currentTarget,'Tap again to remove'))return;
  if(open){clearTimeout(stT);ST.pos=scrollY;ST.hl=HL;DB.put('state:'+id,ST);DOC=null;} // saved without its shelf entry
  const tr=toTrash('book',{bookId:id,title:m.title,meta:m,hl:hl.length||m.hl,notes:hl.filter(h=>h.note).length});
  await DB.del('meta:'+id);META=META.filter(x=>x.id!==id);
  closeModal('#detM');movedToTrash(tr);if(open) goShelf(); else renderShelf();
};
$('#barTitle').onclick=()=>DOC&&openDetails(DOC.id);

/* ================= reader ================= */
let blockIndex={},order={},secOf={};
async function openBook(id,opts){
  $('#busy').classList.remove('hidden');
  const d=await DB.get('doc:'+id);
  if(!d){$('#busy').classList.add('hidden');toast("Couldn't find that text");return;}
  resetFind(id);
  const st=(await DB.get('state:'+id))||{hl:[],pos:0,maxP:0,done:[]}; // read first: the save timers expect DOC and ST together
  DOC=d;ST=st;ST.done=ST.done||[];HL=ST.hl||[];ST.opened=Date.now();landSeen=false;lastTick=Date.now();
  show('reader');buildReader();$('#busy').classList.add('hidden');
  ls.set('last',id);
  const h=opts&&opts.hl&&HL.find(x=>x.id===opts.hl);
  requestAnimationFrame(()=>{if(h)jumpTo(h);else window.scrollTo(0,ST.pos||0);lastH=0;onScroll();});
  saveState();
}
function inlineHTML(b,plain){
  const t=b.text||'',L=t.length,cl=x=>Math.max(0,Math.min(L,x));
  const cuts=new Set([0,L]);const marks=b.marks||[];
  marks.forEach(m=>{cuts.add(cl(m.s));cuts.add(cl(m.e));});
  const fns=plain?[]:(b.fns||[]);fns.forEach(f=>cuts.add(cl(f.at)));
  const hs=[];if(!plain)HL.forEach(h=>h.segs.forEach(s=>{if(s.pid===b.id){hs.push({s:s.s,e:s.e,h});cuts.add(cl(s.s));cuts.add(cl(s.e));}}));
  const wds=plain?[]:wordSpans(b);wds.forEach(w=>{cuts.add(cl(w.s));cuts.add(cl(w.e));}); // saved words (see vocabulary)
  const c=[...cuts].sort((a,z)=>a-z);let out='';
  const fnAt=p=>fns.filter(f=>cl(f.at)===p).map(f=>`<button class="fn" data-n="${f.n}" aria-expanded="false" aria-label="Note ${f.n}">${f.n}</button>`).join('');
  for(let i=0;i<c.length-1;i++){
    const a=c[i],z=c[i+1];out+=fnAt(a);
    let s=esc(t.slice(a,z));const act=marks.filter(m=>m.s<=a&&m.e>=z);
    if(act.some(m=>m.k==='code')) s=`<code>${s}</code>`;
    if(act.some(m=>m.k==='i')) s=`<em>${s}</em>`;
    if(act.some(m=>m.k==='b')) s=`<strong>${s}</strong>`;
    const wd=wds.find(w=>w.s<=a&&w.e>=z);if(wd) s=`<span class="wd" data-w="${esc(wd.id)}" data-ws="${wd.s}">${s}</span>`;
    let cov=null;hs.forEach(x=>{if(x.s<=a&&x.e>=z)cov=x.h;});
    if(cov) s=`<mark class="hl c-${cov.color}${cov.note?' noted':''}" data-h="${cov.id}">${s}</mark>`;
    const ln=act.find(m=>m.k==='a');
    if(ln&&/^(https?:|mailto:)/i.test(ln.href)) s=`<a href="${esc(ln.href)}" target="_blank" rel="noopener noreferrer">${s}</a>`;
    out+=s;
  }
  return out+fnAt(L);
}
function pickPulls(){
  const res={};let lastAt=-99;
  const imp=/^(Don't|Never|Be|Try|Use|Seek|Work|Take|Make|Have|Develop|Avoid|Begin|Start|Notice|Keep|Find|Ask|Err|When in doubt|Choose|Always|Remember)\b/;
  DOC.blocks.forEach((b,i)=>{
    if(b.t!=='p'||i-lastAt<6) return;
    const sents=b.text.match(/[^.!?]+[.!?]+["”']?/g)||[];let best=null,bs=0,off=0;
    sents.forEach(s=>{const tt=s.trim();const st=b.text.indexOf(tt,off);off=st+tt.length;const w=tt.split(/\s+/).length;
      if(w<5||w>16||/^[a-z(]/.test(tt)) return;let sc=1;if(imp.test(tt))sc+=2;if(w<=11)sc+=1;if(sc>bs){bs=sc;best={t:tt,s:st,e:st+tt.length};}});
    if(best&&bs>=4){res[b.id]=best;lastAt=i;}
  });
  return res;
}
const minsOf=w=>Math.max(1,Math.round(w/230));
const CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
function blockHTML(b,first){
  const pid=`data-pid="${b.id}"`;
  if(b.t==='h'){const lv=Math.min(4,Math.max(3,(b.level||2)-(DOC.secLevel||1)+3));return `<h${lv} class="hp" id="h-${b.id}" ${pid}>${inlineHTML(b)}</h${lv}>`;}
  if(b.t==='quote') return `<blockquote class="hp" ${pid}>${inlineHTML(b)}</blockquote>`;
  if(b.t==='code') return `<pre class="hp" ${pid}>${esc(b.text)}</pre>`;
  if(b.t==='hr') return '<hr class="hr">';
  if(b.t==='img') return `<figure class="fig"><img src="${esc(b.src)}" alt="${esc(b.alt||'')}" loading="lazy" referrerpolicy="no-referrer">${b.caption?`<figcaption>${esc(b.caption)}</figcaption>`:''}</figure>`;
  return `<p class="hp${first&&b.text.length>140&&/^[A-Za-z"“]/.test(b.text)?' first':''}" ${pid}>${inlineHTML(b)}</p>`;
}
function listMark(b,depth){return b.list==='ol'?(b.num||1)+'.':(depth%2?'◦':'•');}
function buildReader(){
  const col=$('#col');blockIndex={};order={};secOf={};
  const S=DOC.sections,N=S.length,mins=minsOf(DOC.words);
  $('#barTitle').innerHTML=esc(DOC.title)+`<small>${mins} min</small>`;
  document.title=DOC.title+' · own-shelf';
  const tw=DOC.title.split(/\s+/),per=Math.ceil(tw.length/Math.min(3,tw.length)),lines=[];
  for(let i=0;i<tw.length;i+=per) lines.push(tw.slice(i,i+per).join(' '));
  let h=`<header class="hero"><h1${DOC.title.length>34?' class="long"':''}>${lines.map(l=>`<span class="ln">${esc(l)}</span>`).join('')}</h1>
    ${DOC.author||DOC.source?`<p class="byline">${DOC.author?'by '+esc(DOC.author):''}${DOC.source?`<a href="${esc(DOC.source)}" target="_blank" rel="noopener noreferrer">Original ↗</a>`:''}</p>`:''}
    <div class="log">${DOC.written?`<span>Written <b>${esc(DOC.written)}</b></span>`:''}<span><b>${DOC.words.toLocaleString()}</b> words</span><span><b>${mins}</b> min</span><span><b>${N}</b> section${N>1?'s':''}</span>${DOC.notes.length?`<span><b>${DOC.notes.length}</b> notes</span>`:''}</div>
    <div class="howto">Select text to highlight in ${COLORS.map(c=>`<span class="sw" style="background:var(--${c[0]}S)" title="${esc(meaning(c[0]))}"></span>`).join('')} · keys 1–${COLORS.length} work too</div>
    ${N>1?`<details class="toc-inline"${N<=12?' open':''}><summary>Contents · ${N} sections</summary><ol class="tocl">${tocItems()}</ol></details>`:''}</header>`;
  const pulls=pickPulls();let idx=0,wordsAfter=DOC.words;
  S.forEach((s,si)=>{
    const bl=DOC.blocks.filter(b=>b.sec===si);
    const head=s.heading?bl.find(b=>b.id===s.heading):null;
    h+=`<div class="leg" id="sec-${si}" data-sec="${si}"><span class="n">${si+1}</span>${head?`<h2 class="hp" data-pid="${head.id}">${inlineHTML(head)}</h2>`:'<span class="orn" aria-hidden="true">❦</span>'}</div>`;
    if(head){blockIndex[head.id]=head;order[head.id]=idx++;secOf[head.id]=si;}
    let firstText=true,inList=false;
    bl.forEach(b=>{
      if(b===head) return;
      if(b.text!==undefined){blockIndex[b.id]=b;order[b.id]=idx++;secOf[b.id]=si;}
      if(b.t==='li'){
        if(!inList){h+='<div class="list" role="list">';inList=true;}
        const d=b.depth||0;h+=`<div class="hp li" role="listitem" style="--d:${d}" data-mark="${listMark(b,d)}" data-pid="${b.id}">${inlineHTML(b)}</div>`;
        firstText=false;return;
      }
      if(inList){h+='</div>';inList=false;}
      const pq=pulls[b.id];
      if(pq&&!firstText) h+=`<aside class="pull" aria-hidden="true">${esc(pq.t)}<button tabindex="-1" data-pq="${b.id}:${pq.s}:${pq.e}">Highlight this</button></aside>`;
      h+=blockHTML(b,firstText&&b.t==='p');
      if(b.text&&b.t!=='h') firstText=false;
    });
    if(inList) h+='</div>';
    wordsAfter-=s.words;
    if(si<N-1) h+=`<div class="cp${ST.done.includes(si)?' reached':''}" data-cp="${si}"><span class="dot">${CHECK}</span><span><b>Checkpoint ${si+1} of ${N-1}</b> · ${Math.round((si+1)/N*100)}% · about ${minsOf(wordsAfter)} min left</span><button class="nx" data-go="${si+1}">Next: ${esc(S[si+1].title)}</button></div>`;
  });
  if(DOC.notes.length){
    h+=`<section class="notes" id="notes"><h2>Notes</h2>`;
    DOC.notes.forEach(n=>{const b={id:n.id,text:n.text,marks:[],fns:[]};blockIndex[b.id]=b;order[b.id]=idx++;secOf[b.id]=-1;
      h+=`<div class="note" id="note-${n.n}"><span class="nn">${n.n||''}</span><p class="hp" data-pid="${b.id}">${inlineHTML(b)}</p></div>`;});
    if(DOC.thanks) h+=`<p class="thanks">${esc(DOC.thanks)}</p>`;
    h+='</section>';
  }
  h+=`<section class="land" id="land"><h2>The end.</h2><p id="landMsg"></p><div class="acts"><button class="btn" id="landCopy">Copy all highlights</button><button class="btn ghost" id="landOpen">Review them</button><button class="btn ghost" id="landExp">Export</button><button class="btn ghost" id="landShelf">Back to shelf</button></div></section>`;
  col.innerHTML=h;
  col.querySelectorAll('.pull button').forEach(btn=>btn.onclick=()=>{const [pid,s,e]=btn.dataset.pq.split(':');addHighlight([{pid,s:+s,e:+e}],'sun','','Highlighted');});
  col.querySelectorAll('figure.fig img').forEach(im=>{im.onerror=()=>{const f=im.closest('figure');f.innerHTML=`<span class="imgfail">This image can't load here${/^https?:/.test(im.src)?` · <a href="${esc(im.src)}" target="_blank" rel="noopener noreferrer">open it</a>`:''}</span>`;};});
  $('#landCopy').onclick=copyAll;$('#landOpen').onclick=()=>openDrawer('#drawer');$('#landShelf').onclick=goShelf;$('#landExp').onclick=()=>openExport('book');
  updateCount();observeCheckpoints();lastH=0;
}
function tocItems(){
  return DOC.sections.map((s,i)=>{
    const n=HL.filter(h=>secOf[h.segs[0].pid]===i).length;
    return `<li><button class="toci${ST.done.includes(i)||ST.finished?' done':''}" data-go="${i}"><span class="tn">${i+1}</span><span class="tt${s.auto?' auto':''}">${esc(s.title)}</span><span class="tm">${minsOf(s.words)} min${n?`<i>✎ ${n}</i>`:''}</span></button>${s.subs.map(x=>`<button class="tocsub" data-goh="${x.id}">${esc(x.title)}</button>`).join('')}</li>`;
  }).join('')+(DOC.notes.length?`<li><button class="toci" data-gonotes><span class="tn">✱</span><span class="tt">Notes</span><span class="tm">${DOC.notes.length}</span></button></li>`:'');
}
function renderToc(){
  const done=ST.finished?DOC.sections.length:ST.done.length;
  $('#tocSub').textContent=`${done} of ${DOC.sections.length} sections done · ${Math.round((ST.maxP||0)*100)}% read`;
  $('#tocList').innerHTML=`<ol class="tocl">${tocItems()}</ol>`;
  const c=$('#tocList').querySelector(`[data-go="${curSec}"]`);if(c){c.classList.add('cur');c.scrollIntoView({block:'nearest'});}
}
function goSec(i){closeDrawers();const el=document.getElementById('sec-'+i);if(el) el.scrollIntoView();}
document.addEventListener('click',e=>{
  const g=e.target.closest('[data-go]');if(g&&DOC){e.preventDefault();goSec(+g.dataset.go);return;}
  const gh=e.target.closest('[data-goh]');if(gh){closeDrawers();const el=document.getElementById('h-'+gh.dataset.goh);if(el)el.scrollIntoView();return;}
  if(e.target.closest('[data-gonotes]')){closeDrawers();$('#notes').scrollIntoView();}
});
// A book counts as finished when the end is on screen AND you've spent real time reading it: at least 30% of its
// estimated reading time (20 s minimum). Time only accrues while the page is visible and you've scrolled, tapped,
// typed or selected in the last 90 s, so flicking or jumping to the end doesn't finish a book.
let landSeen=false,lastActive=0,lastTick=Date.now();
const markActive=()=>{lastActive=Date.now();};
addEventListener('scroll',markActive,{passive:true});addEventListener('pointerdown',markActive,{passive:true});addEventListener('keydown',markActive);document.addEventListener('selectionchange',markActive);
const finishAfterMs=()=>Math.max(20000,minsOf(DOC.words)*60000*0.3);
function maybeFinish(){if(DOC&&ST&&!ST.finished&&landSeen&&(ST.readMs||0)>=finishAfterMs()){ST.finished=true;ST.maxP=1;saveState();}}
setInterval(()=>{const now=Date.now();if(DOC&&ST&&document.visibilityState==='visible'&&now-lastActive<90000){ST.readMs=(ST.readMs||0)+Math.min(now-lastTick,60000);maybeFinish();}lastTick=now;},5000);
let cpObs=null;
function observeCheckpoints(){
  if(cpObs) cpObs.disconnect();
  if(!('IntersectionObserver' in window)) return;
  cpObs=new IntersectionObserver(es=>es.forEach(en=>{
    const el=en.target;
    if(el.id==='land'){ landSeen=en.isIntersecting; maybeFinish(); return; }
    if(!en.isIntersecting) return;
    const i=+el.dataset.cp; if(!ST.done.includes(i)){ST.done.push(i);el.classList.add('reached');saveState();}
  }),{threshold:.9});
  document.querySelectorAll('.cp').forEach(c=>cpObs.observe(c));cpObs.observe($('#land'));
}

/* rail + scroll. The rail is a straight spine drawn in index.html and centred by CSS; JS only sets each mark's top */
let legPos=[],curSec=0,lastH=0,ticking=false;
function layoutRail(){
  const total=Math.max(1,document.documentElement.scrollHeight-innerHeight);
  legPos=[...document.querySelectorAll('.leg')].map(l=>({i:+l.dataset.sec,y:l.getBoundingClientRect().top+scrollY-110}));
  $('#wps').innerHTML=legPos.map(l=>{const p=Math.min(1,Math.max(0,l.y/total));return `<button class="wp" style="top:${p*100}%" data-go="${l.i}" aria-label="Section ${l.i+1}"><span class="tip">${l.i+1}. ${esc(DOC.sections[l.i].title)}</span></button>`;}).join('');
}
function onScroll(){
  if(!DOC) return;
  const H=document.documentElement.scrollHeight;if(H!==lastH){lastH=H;layoutRail();}
  const p=Math.min(1,Math.max(0,scrollY/Math.max(1,H-innerHeight)));
  $('#routeFg').setAttribute('stroke-dasharray',`${(p*1000).toFixed(1)} 1000`);
  $('#railMark').style.top=(p*100)+'%';
  $('#hbar .fill').style.width=(p*100)+'%';$('#hbar .bookmark').style.left=`clamp(8px,${p*100}%,calc(100% - 8px))`;
  curSec=0;legPos.forEach(l=>{if(scrollY>=l.y-5)curSec=l.i;});
  document.querySelectorAll('#wps .wp').forEach((w,i)=>w.classList.toggle('done',ST.done.includes(i)||!!ST.finished||(legPos[i]&&scrollY>=legPos[i].y+5&&i<curSec)));
  if(p>(ST.maxP||0)+0.004){ST.maxP=p;saveState();}
  if(document.body.classList.contains('focus')){
    const mid=innerHeight*.42;let best=null,bd=1e9;
    document.querySelectorAll('#col .hp').forEach(el=>{const r=el.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;const dd=r.top<=mid&&r.bottom>=mid?0:Math.min(Math.abs(r.top-mid),Math.abs(r.bottom-mid));if(dd<bd){bd=dd;best=el;}});
    document.querySelectorAll('#col .hp.lit').forEach(el=>el!==best&&el.classList.remove('lit'));if(best)best.classList.add('lit');
  }
  clearTimeout(onScroll.t);onScroll.t=setTimeout(()=>{if(DOC){ST.pos=scrollY;saveState();}},400);
}
addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(()=>{ticking=false;onScroll();});}},{passive:true});
addEventListener('resize',()=>{lastH=0;onScroll();});

/* bar actions */
$('#bFocus').onclick=e=>{const on=document.body.classList.toggle('focus');e.currentTarget.setAttribute('aria-pressed',on);onScroll();};
$('#bSize').onclick=()=>{prefs.size=(prefs.size+1)%SIZES.length;savePrefs();applyPrefs();lastH=0;onScroll();toast(['Smaller','Regular','Larger'][prefs.size]+' text');};
$('#bTheme').onclick=()=>{const dark=matchMedia('(prefers-color-scheme: dark)').matches;const cur=prefs.theme==='auto'?(dark?'dark':'light'):prefs.theme;prefs.theme=cur==='dark'?'light':'dark';savePrefs();applyPrefs();};
$('#bToc').onclick=()=>{renderToc();openDrawer('#toc');};
$('#bHl').onclick=()=>openDrawer('#drawer');
function openDrawer(id){closeDrawers();if(id==='#drawer')renderDrawer();$(id).classList.add('open');$('#scrim').classList.add('on');}
function closeDrawers(){document.querySelectorAll('.drawer').forEach(d=>d.classList.remove('open'));$('#scrim').classList.remove('on');}
$('#scrim').onclick=closeDrawers;document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeDrawers);

/* footnotes, images, marks */
$('#col').addEventListener('click',e=>{
  const fn=e.target.closest('.fn');
  if(fn){e.preventDefault();const p=fn.closest('.hp'),n=fn.dataset.n;
    const ex=p.nextElementSibling&&p.nextElementSibling.classList.contains('fn-card')&&p.nextElementSibling.dataset.n===n;
    document.querySelectorAll('.fn-card').forEach(c=>c.remove());document.querySelectorAll('.fn[aria-expanded="true"]').forEach(f=>f.setAttribute('aria-expanded','false'));
    if(!ex){const note=DOC.notes.find(x=>String(x.n)===n);const c=document.createElement('div');c.className='fn-card';c.dataset.n=n;const nb=note&&blockIndex[note.id];c.innerHTML=`<b>${n}</b>`+(nb?`<span class="hp" data-pid="${note.id}">${inlineHTML(nb)}</span>`:esc(note?note.text:'Note not found.'));p.after(c);fn.setAttribute('aria-expanded','true');}
    return;}
  const im=e.target.closest('figure.fig img');if(im){$('#lightbox img').src=im.src;$('#lightbox').classList.remove('hidden');return;}
  const m=e.target.closest('mark.hl');if(m&&getSelection().isCollapsed&&!e.target.closest('a')) showTool(m.getBoundingClientRect(),HL.find(h=>h.id===m.dataset.h));
});
$('#lightbox').onclick=()=>$('#lightbox').classList.add('hidden');

/* ================= highlighting ================= */
const tool=$('#tool');let pendingSegs=null,editing=null;
const coarse=matchMedia('(pointer:coarse)').matches;
function pointOffset(block,node,off){const r=document.createRange();r.setStart(block,0);try{r.setEnd(node,off);}catch(e){return 0;}const f=r.cloneContents();f.querySelectorAll('.fn').forEach(x=>x.remove());return f.textContent.length;}
function rangeToSegs(range){
  const segs=[];
  document.querySelectorAll('#col .hp').forEach(b=>{
    if(!range.intersectsNode(b)) return;const pid=b.dataset.pid;if(!blockIndex[pid]) return;const t=blockIndex[pid].text;
    let s=b.contains(range.startContainer)?pointOffset(b,range.startContainer,range.startOffset):0;
    let e=b.contains(range.endContainer)?pointOffset(b,range.endContainer,range.endOffset):t.length;
    s=Math.max(0,Math.min(s,t.length));e=Math.max(0,Math.min(e,t.length));
    while(s<e&&/\s/.test(t[s]))s++;while(e>s&&/\s/.test(t[e-1]))e--;
    if(e>s){const ex=segs.find(x=>x.pid===pid);if(ex){ex.s=Math.min(ex.s,s);ex.e=Math.max(ex.e,e);}else segs.push({pid,s,e});}
  });
  return segs;
}
function segText(h){return h.segs.map(s=>blockIndex[s.pid]?blockIndex[s.pid].text.slice(s.s,s.e):'').join('\n\n');}
function rerender(pids){new Set(pids).forEach(pid=>{const b=blockIndex[pid];if(!b||b.t==='code')return;document.querySelectorAll(`#col .hp[data-pid="${pid}"]`).forEach(el=>{el.innerHTML=inlineHTML(b);});});}
function commit(){ST.hl=HL;saveState();updateCount();if($('#drawer').classList.contains('open'))renderDrawer();}
// A new highlight joins the ones it overlaps or touches (joinHighlights in parse.js); "Joined N highlights · Undo".
// color null (the toolbar's Note): the colour of the one it joins, else Sunny. said: the toast when nothing joins.
function addHighlight(segs,color,note,said){
  const now=Date.now(),texts={},linked=new Set(),id=DOC.id;
  segs.forEach(s=>{texts[s.pid]=blockIndex[s.pid]&&blockIndex[s.pid].text;});
  if(WORDS) WORDS.forEach(w=>{if(isFact(w)&&w.bookId===id) linked.add(w.hlId);});
  const {h,hit,n}=joinHighlights(HL,{id:'h'+now.toString(36)+Math.random().toString(36).slice(2,5),color:color||null,note:note||'',segs,at:now},texts,order,linked);
  if(!h.color) h.color='sun';
  const was=JSON.parse(JSON.stringify(hit));
  HL=HL.filter(x=>!hit.includes(x)).concat(h);commit();rerender(h.segs.map(s=>s.pid));
  if(n) toast(`Joined ${n} highlights`,{label:'Undo',run:()=>unjoin(id,h,was)});else if(said) toast(said);
  return h;
}
// Undo for a join: the joined highlight gives way to the ones it was made from, as they were.
async function unjoin(id,h,was){
  const open=!!(DOC&&DOC.id===id),st=open?ST:await DB.get('state:'+id),hl=open?HL:st&&st.hl,i=hl?hl.findIndex(x=>x.id===h.id):-1;
  if(i<0) return;
  hl.splice(i,1,...was);
  if(open){commit();rerender(h.segs.map(s=>s.pid));if(noteTarget===h) $('#noteBox').classList.add('hidden');}
  else{DB.put('state:'+id,st);const m=META.find(x=>x.id===id);if(m){m.hl=hl.length;DB.put('meta:'+id,m);}}
  toast('Undone');
}
function updateCount(){
  $('#hlCount').textContent=HL.length;const lm=$('#landMsg');if(!lm)return;const nn=HL.filter(h=>h.note).length;
  lm.textContent=HL.length?`You marked ${HL.length} highlight${HL.length>1?'s':''}${nn?` and wrote ${nn} note${nn>1?'s':''}`:''}. Take them with you.`:'You made it to the end. Select any passage above to highlight it, then copy everything from here.';
}
function showTool(rect,h){
  editing=h||null;
  tool.innerHTML=COLORS.map((c,i)=>{const m=`${esc(meaning(c[0]))} (${i+1})`;return `<button class="sw${h&&h.color===c[0]?' on':''}" style="background:var(--${c[0]}S)" data-c="${c[0]}" aria-label="${m}" title="${m}"></button>`;}).join('')+
    `<span class="sep"></span><button class="tb" data-a="note">${h&&h.note?'Edit note':'Note'}</button>`+(h?`<button class="tb" data-a="del">Remove</button>`:`<button class="tb" data-a="word">Word</button><button class="tb" data-a="copy">Copy</button>`);
  tool.classList.remove('hidden');
  if(coarse){tool.classList.add('docked');return;}
  tool.classList.remove('docked');const w=tool.offsetWidth,hh=tool.offsetHeight;
  let top=rect.top-hh-10;if(top<70)top=rect.bottom+10;
  tool.style.top=top+'px';tool.style.left=Math.max(10,Math.min(innerWidth-w-10,rect.left+rect.width/2-w/2))+'px';tool.style.transform='none';
}
function hideTool(){tool.classList.add('hidden');pendingSegs=null;editing=null;}
tool.addEventListener('mousedown',e=>e.preventDefault());
tool.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.c){
    if(editing){editing.color=b.dataset.c;commit();rerender(editing.segs.map(s=>s.pid));}
    else if(pendingSegs){addHighlight(pendingSegs,b.dataset.c);getSelection().removeAllRanges();}
    hideTool();return;}
  if(b.dataset.a==='del'&&editing){const pids=editing.segs.map(s=>s.pid),tr=trashHighlights([editing]);HL=HL.filter(x=>x!==editing);commit();rerender(pids);hideTool();movedToTrash(tr);return;}
  if(b.dataset.a==='word'&&pendingSegs){saveWordFromSel(pendingSegs);return;}
  if(b.dataset.a==='copy'&&pendingSegs){copyText(pendingSegs.map(s=>blockIndex[s.pid].text.slice(s.s,s.e)).join('\n\n'),'Copied');return;}
  if(b.dataset.a==='note'){let h=editing;if(!h&&pendingSegs){h=addHighlight(pendingSegs,null);getSelection().removeAllRanges();}if(h)openNote(h,tool.getBoundingClientRect());hideTool();}
});
let selT;
function checkSel(){
  const sel=getSelection();
  if(!DOC||sel.isCollapsed||!sel.rangeCount){if(!editing)hideTool();return;}
  const r=sel.getRangeAt(0);if(!$('#col').contains(r.commonAncestorContainer))return;
  const segs=rangeToSegs(r);if(!segs.length){hideTool();return;}
  showTool(r.getBoundingClientRect(),null);pendingSegs=segs;
}
document.addEventListener('selectionchange',()=>{clearTimeout(selT);selT=setTimeout(checkSel,coarse?350:180);});
document.addEventListener('mousedown',e=>{if(!tool.contains(e.target)&&!e.target.closest('mark.hl')&&!$('#noteBox').contains(e.target)){editing=null;if(getSelection().isCollapsed)hideTool();}});
addEventListener('scroll',()=>{if(tool.classList.contains('hidden')||coarse)return;if(editing){hideTool();return;}const sel=getSelection();if(pendingSegs&&sel.rangeCount&&!sel.isCollapsed){const s=pendingSegs;showTool(sel.getRangeAt(0).getBoundingClientRect(),null);pendingSegs=s;}},{passive:true});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){hideTool();closeDrawers();$('#noteBox').classList.add('hidden');$('#lightbox').classList.add('hidden');document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));return;}
  if(e.target.matches('textarea,input,[contenteditable]'))return;
  if(/^[1-9]$/.test(e.key)&&COLORS[+e.key-1]&&pendingSegs&&!tool.classList.contains('hidden')){addHighlight(pendingSegs,COLORS[+e.key-1][0]);getSelection().removeAllRanges();hideTool();}
});
// The note box and the word card stay inside the visible area, which an on-screen keyboard shrinks (visualViewport;
// on an iPhone the page keeps its full height under the keyboard): docked at the bottom when `at` is null, else with
// its top left corner at `at`, moved inside if need be. Their max-height keeps them inside as they grow (styles.css).
// → where it went: null when docked, else {x,y}.
function placeCard(box,at){
  const vv=window.visualViewport,vt=vv?vv.offsetTop:0,vl=vv?vv.offsetLeft:0,vh=vv?vv.height:innerHeight,vw=vv?vv.width:innerWidth,s=box.style;
  if(!at){
    const sab='env(safe-area-inset-bottom,0px)';
    Object.assign(s,{left:'50%',transform:'translateX(-50%)',top:'auto',bottom:`calc(${sab} + 16px)`});
    const under=box.getBoundingClientRect().bottom-(vt+vh-16); // under the keyboard: lift it above
    if(under>0) s.bottom=`calc(${sab} + ${16+under}px)`;
    s.maxHeight=`calc(${box.getBoundingClientRect().bottom-vt-12}px - env(safe-area-inset-top,0px))`;
    return null;
  }
  Object.assign(s,{transform:'none',bottom:'auto',maxHeight:vh-24+'px'});
  const x=Math.max(vl+10,Math.min(vl+vw-box.offsetWidth-10,at.x)),y=Math.max(vt+12,Math.min(vt+vh-box.offsetHeight-12,at.y));
  Object.assign(s,{left:x+'px',top:y+'px',maxHeight:vt+vh-y-12+'px'});
  return {x,y};
}
let noteTarget=null,noteAt=null;
function openNote(h,rect){
  noteTarget=h;const nb=$('#noteBox');nb.classList.remove('hidden');$('#noteTa').value=h.note||'';
  noteAt=placeCard(nb,coarse||!rect?null:{x:rect.left,y:Math.min(innerHeight-220,Math.max(70,rect.top))});
  setTimeout(()=>$('#noteTa').focus(),30);
}
$('#noteCancel').onclick=()=>$('#noteBox').classList.add('hidden');
$('#noteSave').onclick=()=>{
  const h=noteTarget;
  if(h){
    const old=h.note||'';h.note=$('#noteTa').value.trim();
    const tr=old&&!h.note&&DOC?toTrash('note',{bookId:DOC.id,title:DOC.title,hlId:h.id,text:old,quote:quoteOf(h),color:h.color}):null; // a cleared note goes to the Trash
    commit();rerender(h.segs.map(s=>s.pid));if(tr)movedToTrash(tr);else toast(h.note?'Note saved':'Note cleared');
  }
  $('#noteBox').classList.add('hidden');
};

/* highlights drawer & export */
let filter='all';
function sorted(list=HL){return [...list].sort((a,b)=>{const A=a.segs[0],B=b.segs[0];return ((order[A.pid]??1e9)-(order[B.pid]??1e9))||(A.s-B.s);});}
const secName=h=>{const i=secOf[h.segs[0].pid];return i===-1?'Notes':i!=null&&DOC.sections[i]?`${i+1}. ${DOC.sections[i].title}`:'';};
function renderDrawer(){
  const counts={};HL.forEach(h=>counts[h.color]=(counts[h.color]||0)+1);const nn=HL.filter(h=>h.note).length;
  const keep=h=>filter==='all'||(filter==='noted'?h.note:h.color===filter);if(!HL.some(keep))filter='all';
  $('#drFilters').innerHTML=`<button class="chip" aria-pressed="${filter==='all'}" data-f="all">All ${HL.length}</button>`+(nn?`<button class="chip" aria-pressed="${filter==='noted'}" data-f="noted">With note ${nn}</button>`:'')+BY_MEANING.filter(c=>counts[c]).map(c=>`<button class="chip" aria-pressed="${filter===c}" data-f="${c}"><i style="background:var(--${c}S)"></i>${esc(meaning(c))} ${counts[c]}</button>`).join('');
  $('#drFilters').querySelectorAll('.chip').forEach(b=>b.onclick=()=>{filter=b.dataset.f;renderDrawer();});
  $('#drGroupRow').classList.toggle('hidden',!HL.length);
  const list=sorted().filter(keep);
  const card=h=>`<div class="hcard" style="border-left-color:var(--${h.color}S)" data-id="${h.id}"><div class="sec">${esc(secName(h))}</div><p class="q" tabindex="0">${esc(segText(h)).replace(/\n\n/g,' <span style="color:var(--muted)">¶</span> ')}</p>${h.note?`<div class="nt">${esc(h.note)}</div>`:''}<div class="acts"><button data-a="note">${h.note?'Edit note':'Add note'}</button><button data-a="del">Remove</button></div></div>`;
  $('#drList').innerHTML=!list.length?`<div class="empty">No highlights yet.<br>Select any passage and pick a color.</div>`
    :prefs.hlGroup==='color'?byColor(list).map(([c,l])=>colorHead(c,l.length)+l.map(card).join('')).join(''):list.map(card).join('');
  $('#drList').querySelectorAll('.hcard').forEach(card=>{
    const h=HL.find(x=>x.id===card.dataset.id);
    card.querySelector('.q').onclick=()=>jumpTo(h);card.querySelector('.q').onkeydown=e=>{if(e.key==='Enter')jumpTo(h);};
    card.querySelector('[data-a="note"]').onclick=()=>openNote(h,card.getBoundingClientRect());
    card.querySelector('[data-a="del"]').onclick=()=>{const pids=h.segs.map(s=>s.pid),tr=trashHighlights([h]);HL=HL.filter(x=>x!==h);commit();rerender(pids);movedToTrash(tr);};
  });
}
function jumpTo(h){closeDrawers();const m=document.querySelector(`mark[data-h="${h.id}"]`);if(!m)return;m.scrollIntoView({block:'center'});document.querySelectorAll(`mark[data-h="${h.id}"]`).forEach(x=>{x.classList.remove('flash');void x.offsetWidth;x.classList.add('flash');});}
$('#segFmt').onclick=e=>{const b=e.target.closest('button');if(!b)return;prefs.fmt=b.dataset.fmt;savePrefs();applyPrefs();};
// Group: the drawer (book order | colour) and the Notebook (newest | colour) share one remembered choice
function groupBy(e,render){const b=e.target.closest('[data-hg]');if(!b)return;prefs.hlGroup=b.dataset.hg;savePrefs();applyPrefs();render();}
$('#drGroup').onclick=e=>groupBy(e,renderDrawer);
$('#clearAll').onclick=async()=>{
  if(!HL.length)return;
  if(!await confirmTyped('Clear all highlights?',`This removes all ${lossText(HL.length,HL.filter(h=>h.note).length)} in “${DOC.title}”. ${TRASH_NOTE}`,'Clear all'))return;
  const tr=trashHighlights(HL);
  const pids=HL.flatMap(h=>h.segs.map(s=>s.pid));HL=[];commit();rerender(pids);movedToTrash(tr);
};
function exportText(){
  const list=sorted();
  if(prefs.fmt==='md'){
    let o=`# Highlights: ${DOC.title}\n`+[DOC.author&&`by ${DOC.author}`,DOC.written,DOC.source].filter(Boolean).map(x=>`_${x}_`).join(' · ')+'\n\n';
    let lastSec=null;
    list.forEach(h=>{const s=secName(h);if(s&&s!==lastSec&&DOC.sections.length>1){o+=`## ${s}\n\n`;lastSec=s;}
      o+=segText(h).split('\n\n').map(p=>'> '+p).join('\n>\n')+'\n';if(h.note)o+=`\n**Note:** ${h.note}\n`;o+=`\n<sub>${meaning(h.color)}</sub>\n\n`;});
    return o.trim()+'\n';
  }
  let o=`Highlights: ${DOC.title}${DOC.author?' — '+DOC.author:''}\n\n`;
  list.forEach((h,i)=>{o+=`${i+1}. “${segText(h).replace(/\n\n/g,' … ')}”\n`;if(h.note)o+=`   Note: ${h.note}\n`;o+='\n';});
  return o.trim()+'\n';
}
function copyText(t,msg){
  const done=()=>toast(msg);
  const fb=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done();}catch(e){toast("Couldn't copy — select the text manually");}ta.remove();};
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done,fb); else fb();
}
function copyAll(){if(!HL.length){toast('No highlights to copy yet');return;}copyText(exportText(),`Copied ${HL.length} highlight${HL.length>1?'s':''}`);}
$('#copyAll').onclick=copyAll;

/* ================= export ================= */
let EX={scope:'book',fmt:prefs.exFmt||'md',notesOnly:false,byColor:!!prefs.exByColor,items:[],text:''};
const COLORHEX={sun:'#F4C21B',mint:'#2FBF8A',coral:'#F2668A',sky:'#4E8FF0',amber:'#F28C28'};
function entriesFor(doc,hl){
  const map={},sec={},ord={};let i=0;
  doc.blocks.forEach(b=>{if(b.text!==undefined){map[b.id]=b.text;sec[b.id]=b.sec;ord[b.id]=i++;}});
  (doc.notes||[]).forEach(n=>{map[n.id]=n.text;sec[n.id]=-1;ord[n.id]=i++;});
  return [...hl].filter(h=>h.segs&&h.segs.length&&map[h.segs[0].pid]!==undefined)
    .sort((a,b)=>(ord[a.segs[0].pid]-ord[b.segs[0].pid])||(a.segs[0].s-b.segs[0].s))
    .map(h=>{const si=sec[h.segs[0].pid];return {id:h.id,at:h.at,text:h.segs.map(s=>(map[s.pid]||'').slice(s.s,s.e)).filter(Boolean),note:h.note||'',color:h.color,
      section:si===-1?'Notes':(doc.sections[si]&&doc.sections.length>1?`${si+1}. ${doc.sections[si].title}`:'')};});
}
async function gatherExport(){
  let books=[];
  if(EX.scope==='book'&&DOC) books=[{doc:DOC,hl:HL}];
  else{
    const ms=META.filter(m=>m.hl>0).sort((a,b)=>b.added-a.added);
    for(const m of ms){const d=await DB.get('doc:'+m.id),s=await DB.get('state:'+m.id);if(d&&s) books.push({doc:d,hl:s.hl||[]});}
  }
  return books.map(b=>({doc:b.doc,entries:entriesFor(b.doc,b.hl).filter(e=>!EX.notesOnly||e.note)})).filter(b=>b.entries.length);
}
function metaLine(d){return [d.author&&'by '+d.author,d.written,d.source].filter(Boolean);}
// A book's entries under their headings → [{head, color, entries}]: runs of one section (no heading when it has none),
// or, grouped by colour, one group per colour in meaning order, headed by its meaning.
function exportGroups(entries){
  if(EX.byColor) return byColor(entries).map(([c,l])=>({head:meaning(c),color:c,entries:l}));
  const gs=[];
  entries.forEach(e=>{const g=gs[gs.length-1];if(g&&(!e.section||e.section===g.head)) g.entries.push(e); else gs.push({head:e.section,entries:[e]});});
  return gs;
}
function renderExport(books,fmt){
  const multi=EX.scope==='shelf';
  const today=new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
  if(fmt==='md'){
    let o=multi?`# My reading notes\n_Exported ${today} · ${books.length} book${books.length===1?'':'s'}_\n\n`:'';
    books.forEach(b=>{
      const H=multi?'##':'#',S=multi?'###':'##';
      o+=`${H} ${b.doc.title}\n`;const ml=metaLine(b.doc);if(ml.length)o+=ml.map(x=>`_${x}_`).join(' · ')+'\n';o+='\n';
      exportGroups(b.entries).forEach(g=>{if(g.head)o+=`${S} ${g.head}\n\n`;
        g.entries.forEach(e=>{o+=e.text.map(p=>'> '+p).join('\n>\n')+'\n';if(e.note)o+=`\n**Note:** ${e.note}\n`;o+='\n';});});
    });
    return o.trim()+'\n';
  }
  if(fmt==='txt'){
    let o=multi?`MY READING NOTES\nExported ${today}\n\n`:'';
    books.forEach(b=>{
      o+=b.doc.title.toUpperCase()+'\n';const ml=metaLine(b.doc);if(ml.length)o+=ml.join(' · ')+'\n';o+='\n';
      let n=0;
      exportGroups(b.entries).forEach(g=>{if(g.head)o+=`— ${g.head}\n\n`;
        g.entries.forEach(e=>{o+=`${++n}. “${e.text.join(' … ')}”\n`;if(e.note)o+=`   Note: ${e.note}\n`;o+='\n';});});
      o+='\n';
    });
    return o.trim()+'\n';
  }
  const title=multi?'My reading notes':'Notes: '+books[0].doc.title;
  let body='';
  books.forEach(b=>{
    body+=`<article><h${multi?2:1}>${esc(b.doc.title)}</h${multi?2:1}>`;const ml=metaLine(b.doc);
    if(ml.length) body+=`<p class="meta">${ml.map(x=>/^https?:/.test(x)?`<a href="${esc(x)}">${esc(x)}</a>`:esc(x)).join(' · ')}</p>`;
    exportGroups(b.entries).forEach(g=>{
      if(g.head) body+=`<h${multi?3:2}>${g.color?`<i class="sw" style="background:${COLORHEX[g.color]||'#999'}"></i>`:''}${esc(g.head)}</h${multi?3:2}>`;
      g.entries.forEach(e=>{body+=`<blockquote style="border-color:${COLORHEX[e.color]||'#999'}">${e.text.map(p=>`<p>${esc(p)}</p>`).join('')}</blockquote>${e.note?`<p class="note"><b>Note</b> ${esc(e.note)}</p>`:''}`;});
    });
    body+='</article>';
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:18px/1.6 Georgia,serif;color:#2E2119;background:#FBF6EA;max-width:40rem;margin:0 auto;padding:2.5rem 1.2rem}h1,h2,h3{font-family:system-ui,sans-serif;line-height:1.15}h1{font-size:2.2rem}h2{margin-top:2.4rem}h3{color:#2F5A43;font-size:1.05rem;margin-top:1.8rem}.meta{color:#6B5A48;font:15px system-ui,sans-serif}blockquote{margin:1.1rem 0;padding:.2rem 0 .2rem 1rem;border-left:5px solid}blockquote p{margin:.3rem 0}.note{font:15px/1.5 system-ui,sans-serif;background:#F3EAD7;border-radius:10px;padding:.5rem .8rem;margin:-.4rem 0 1.4rem}article+article{border-top:2px solid #DCCBA8;margin-top:3rem}a{color:#2F5A43}.stamp{color:#6B5A48;font:14px system-ui,sans-serif}.sw{display:inline-block;width:.7em;height:.7em;border-radius:50%;margin-right:.45em}</style></head>
<body>${multi?`<h1>My reading notes</h1><p class="stamp">Exported ${esc(today)}</p>`:''}${body}</body></html>
`;
}
async function refreshExport(){
  document.querySelectorAll('#expScope button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.s===EX.scope));
  document.querySelectorAll('#expFmt button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.f===EX.fmt));
  $('#expErr').classList.add('hidden');
  const books=await gatherExport();EX.books=books;
  const n=books.reduce((a,b)=>a+b.entries.length,0),nn=books.reduce((a,b)=>a+b.entries.filter(e=>e.note).length,0);
  if(!n){EX.text='';$('#expSum').textContent=EX.notesOnly?'No highlights with notes yet.':'No highlights to export yet. Select text while reading to add some.';$('#expPrev').textContent='';$('#expPrev').classList.add('hidden');return;}
  EX.text=renderExport(books,EX.fmt);
  $('#expSum').textContent=`${n} highlight${n===1?'':'s'}, ${nn} with notes${EX.scope==='shelf'?`, from ${books.length} book${books.length===1?'':'s'}`:''}.`;
  $('#expPrev').classList.remove('hidden');$('#expPrev').textContent=EX.text.length>6000?EX.text.slice(0,6000)+'\n…':EX.text;
}
async function openExport(scope){
  EX.scope=DOC?scope:'shelf';$('#expScopeWrap').classList.toggle('hidden',!DOC);$('#expByColor').checked=EX.byColor;
  closeDrawers();openModal('#expM');
  await refreshExport();
}
$('#expScope').onclick=e=>{const b=e.target.closest('button');if(!b)return;EX.scope=b.dataset.s;refreshExport();};
$('#expFmt').onclick=e=>{const b=e.target.closest('button');if(!b)return;EX.fmt=b.dataset.f;prefs.exFmt=EX.fmt;savePrefs();refreshExport();};
$('#expNotesOnly').onchange=e=>{EX.notesOnly=e.target.checked;refreshExport();};
$('#expByColor').onchange=e=>{EX.byColor=prefs.exByColor=e.target.checked;savePrefs();refreshExport();};
$('#expCopy').onclick=()=>{if(!EX.text){toast('Nothing to copy yet');return;}copyText(EX.text,'Copied to clipboard');};
function download(name,text,type){
  const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');
  a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000);
}
$('#expDl').onclick=()=>{
  if(!EX.text){toast('Nothing to export yet');return;}
  const slug=(EX.scope==='shelf'||!DOC?'reading-notes':DOC.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)+'-notes')||'notes';
  download(`${slug}.${EX.fmt}`,EX.text,{md:'text/markdown',html:'text/html',txt:'text/plain'}[EX.fmt]+';charset=utf-8');toast('Downloaded');
};
$('#nbBtn').onclick=()=>openNotebook();
$('#expBook').onclick=()=>openExport('book');

/* ================= search in book ================= */
// Find on Page for the reader: a home-screen web app on iPhone has no Safari "Find on Page".
let FIND={book:null,q:'',hits:[],idx:null,t:0}; // hits: [{pid,s,e}] as offsets into each block's text
const FOLD=new Map();
// Lower case, no accents, đ→d, straight quotes, plain spaces. a[k]..z[k] is the original span of folded char k.
function fold(s){
  let t='',i=0;const a=[],z=[];
  for(const ch of s){
    let f=FOLD.get(ch);if(f===undefined){f=ch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s/g,' ');FOLD.set(ch,f);}
    if(!f&&z.length) z[z.length-1]=i+ch.length; // a dropped combining mark belongs to the letter before it
    for(let k=0;k<f.length;k++){a.push(i);z.push(i+ch.length);}
    t+=f;i+=ch.length;
  }
  return {t,a,z};
}
const findIdx=()=>Object.keys(order).sort((x,y)=>order[x]-order[y]).map(pid=>Object.assign({pid},fold(blockIndex[pid].text||'')));
const findSec=pid=>{const i=secOf[pid];return i===-1?'<small>Notes</small>':DOC.sections.length>1&&DOC.sections[i]?`<small>${esc(`${i+1}. ${DOC.sections[i].title}`)}</small>`:'';};
function snippet(h){
  const t=blockIndex[h.pid].text,L=t.length;let a=Math.max(0,h.s-40),b=Math.min(L,h.e+40);
  if(a>0){const sp=t.indexOf(' ',a);if(sp>-1&&sp<h.s)a=sp+1;}
  if(b<L){const sp=t.lastIndexOf(' ',b);if(sp>h.e)b=sp;}
  return (a>0?'…':'')+esc(t.slice(a,h.s))+'<b>'+esc(t.slice(h.s,h.e))+'</b>'+esc(t.slice(h.e,b))+(b<L?'…':'');
}
function runFind(){
  clearTimeout(FIND.t);const q=$('#findQ').value.trim().replace(/\s+/g,' ');if(q===FIND.q) return;
  FIND.q=q;FIND.hits=[];clearFindMark();const f=fold(q).t;let more=false;
  if(DOC&&q.length>=2&&f){
    FIND.idx=FIND.idx||findIdx();
    for(const x of FIND.idx){
      for(let k=x.t.indexOf(f);k>-1&&!more;k=x.t.indexOf(f,k+f.length)){if(FIND.hits.length===200) more=true; else FIND.hits.push({pid:x.pid,s:x.a[k],e:x.z[k+f.length-1]});}
      if(more) break;
    }
  }
  const n=FIND.hits.length;
  $('#findSub').textContent=q.length<2?'':!n?'No matches':more?'200+ matches':n===1?'1 match':`${n} matches`;
  $('#findList').innerHTML=FIND.hits.map((h,i)=>`<button class="fhit" data-i="${i}">${findSec(h.pid)}<span>${snippet(h)}</span></button>`).join('');
  $('#findList').scrollTop=0;
}
// text offset → DOM point, skipping footnote markers (the reverse of pointOffset)
function textPoint(el,off,end){
  const w=document.createTreeWalker(el,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===3?NodeFilter.FILTER_ACCEPT:n.classList.contains('fn')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_SKIP});
  let n,last=null;while((n=w.nextNode())){if(off<n.length||(end&&off===n.length)) return [n,off];off-=n.length;last=n;}
  return last?[last,last.length]:[el,0];
}
const clearFindMark=()=>{if(window.CSS&&CSS.highlights) CSS.highlights.delete('find');document.querySelectorAll('#col .found').forEach(x=>x.classList.remove('found'));};
function openHit(i){
  const h=FIND.hits[i];if(!h) return;
  $('#findQ').blur();closeDrawers();
  const el=[...document.querySelectorAll(`#col .hp[data-pid="${h.pid}"]`)].find(x=>!x.closest('.fn-card'));if(!el) return;
  const r=document.createRange();r.setStart(...textPoint(el,h.s));r.setEnd(...textPoint(el,h.e,true));
  const box=r.getBoundingClientRect();if(box.height) scrollBy(0,box.top+box.height/2-innerHeight/2); else el.scrollIntoView({block:'center'});
  if(window.Highlight&&window.CSS&&CSS.highlights) CSS.highlights.set('find',new Highlight(r));
  else{clearFindMark();void el.offsetWidth;el.classList.add('found');}
}
// keeps the query and results while the same book stays open
function resetFind(id){
  if(id&&id===FIND.book) return;
  clearTimeout(FIND.t);clearFindMark();FIND={book:id||null,q:'',hits:[],idx:null,t:0};
  $('#findQ').value='';$('#findSub').textContent='';$('#findList').innerHTML='';
}
$('#bFind').onclick=()=>{openDrawer('#find');$('#findQ').focus({preventScroll:true});};
$('#findQ').oninput=()=>{clearTimeout(FIND.t);FIND.t=setTimeout(runFind,200);};
$('#findQ').addEventListener('keydown',e=>{
  if(e.key==='Escape') e.preventDefault(); // keep the query; the document handler closes the drawer
  if(e.key==='Enter'&&!e.isComposing){e.preventDefault();runFind();openHit(0);}
});
$('#findList').onclick=e=>{const b=e.target.closest('[data-i]');if(b) openHit(+b.dataset.i);};

/* ================= link import ================= */
// The Worker (worker/worker.js) fetches the page; Readability extracts the article here.
const workerUrl=()=>(SETTINGS.workerUrl||WORKER_URL||'').trim().replace(/\/+$/,'');
const canImportLinks=()=>!!(DB&&DB.kind==='cloud'&&workerUrl());
const published=s=>{const d=s?new Date(s):null;return d&&!isNaN(d)?d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}):'';};
function readable(html,url){
  if(!window.Readability) throw new Error('readability missing');
  const doc=new DOMParser().parseFromString(html,'text/html');
  const base=doc.createElement('base');base.href=url;doc.head.prepend(base); // relative links and images resolve against the page
  const a=new Readability(liftArticleHeaders(doc)).parse();
  if(!a||!a.content) throw new Error('no article');
  const by=(a.byline||'').replace(/^\s*by\s+/i,'').trim(),title=(a.title||'').trim();
  return {blocks:htmlToBlocks(a.content),title,hint:title,author:by.length<80?by:'',written:published(a.publishedTime),source:url};
}
const LINK_ERR={'pdf.js missing':"The PDF reader didn't load. Try again, or paste the text instead.",'no text':"Couldn't read any text from that PDF.",
  'readability missing':"The article reader didn't load. Try again.",'no article':"Couldn't find an article on that page. Copy the text and paste it instead."};
async function importLink(raw){
  const url=firstUrl(raw);
  if(!url){impErr('That doesn’t look like a web link.');return false;}
  if(!DB||DB.kind!=='cloud'){impErr('Importing links needs Google sign-in. You can still paste the article text below.');return false;}
  const base=workerUrl();
  if(!base){impErr('Add the link import helper URL in Settings first.');return false;}
  const host=new URL(url).hostname.replace(/^www\./,'');
  $('#impErr').classList.add('hidden');pending=null;$('#dzHint').textContent='Fetching '+host+'…';$('#linkGo').disabled=true;
  try{
    const token=await fb.auth.currentUser.getIdToken();
    let r;
    try{r=await fetch(base+'/?url='+encodeURIComponent(url),{headers:{Authorization:'Bearer '+token}});}
    catch(e){throw new Error('The link import helper didn’t answer. Check its URL in Settings.');}
    if(!r.ok){let m='';try{m=(await r.json()).error;}catch(e){}throw new Error(m||`The link import helper answered ${r.status}.`);}
    const final=r.headers.get('X-Final-URL')||url,type=(r.headers.get('Content-Type')||'').toLowerCase(),buf=await r.arrayBuffer();
    let res;
    if(/application\/pdf/.test(type)){
      let name='';try{name=decodeURIComponent(new URL(final).pathname.split('/').pop());}catch(e){}
      res=await pdfBlocks(new File([buf],name||host+'.pdf',{type:'application/pdf'}));res.source=final;
    }
    else if(/text\/(plain|markdown)/.test(type)) res={blocks:mdToBlocks(decodeBody(buf,type)),hint:'',author:'',source:final};
    else res=readable(decodeBody(buf,type),final);
    pending=Object.assign({name:host},res);renderPending();detect();return true;
  }catch(e){console.error(e);pending=null;renderPending();impErr(LINK_ERR[e.message]||e.message);return false;}
  finally{$('#linkGo').disabled=false;}
}
$('#linkGo').onclick=()=>importLink($('#link').value);
$('#link').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();importLink($('#link').value);}});
$('#pasteBtn').onclick=async()=>{
  let html='',txt='';const imgs=[];
  try{
    if(navigator.clipboard&&navigator.clipboard.read){
      for(const it of await navigator.clipboard.read()){
        if(!html&&it.types.includes('text/html')) html=await (await it.getType('text/html')).text();
        if(!txt&&it.types.includes('text/plain')) txt=await (await it.getType('text/plain')).text();
        const im=it.types.find(t=>/^image\//.test(t));if(im) imgs.push(new File([await it.getType(im)],'clipboard',{type:im}));
      }
    } else txt=await navigator.clipboard.readText();
  }catch(e){toast('Couldn’t read the clipboard. Paste into the box instead.');pasteBox.focus();return;}
  if(isLoneUrl(txt)){$('#link').value=txt.trim();importLink(txt);return;}
  if(!html.trim()&&!txt.trim()&&!imgs.length){toast('The clipboard is empty');return;}
  await insertClip(html,txt,imgs);
};

/* ================= notebook ================= */
// Every highlight on the shelf, newest first. Read-only; the books are reloaded each time it opens.
let NB={items:[],f:'all',run:0};
const nbFold=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
const nbCount=(n,w)=>`<b>${n}</b> ${w}${n===1?'':'s'}`;
async function openNotebook(){
  const run=++NB.run;show('notebook');window.scrollTo(0,0);
  SORT=sortReset(); // the Words tab's To sort waits for the books below
  nbTab(prefs.nbTab==='wd'?'wd':'hl',true);
  NB.f='all';$('#nbQ').value='';$('#nbStats').innerHTML='';$('#nbCtrl').classList.add('hidden');
  $('#nbList').innerHTML='<div class="empty">Gathering your highlights…</div>';
  const books=(await Promise.all(META.filter(m=>m.hl>0).map(async m=>{const [d,s]=await Promise.all([DB.get('doc:'+m.id),DB.get('state:'+m.id)]);return d&&s?{doc:d,hl:s.hl||[]}:null;}))).filter(Boolean);
  if(run!==NB.run) return;
  sortLoaded(books);
  NB.items=books.flatMap(({doc,hl})=>entriesFor(doc,hl).map(e=>Object.assign(e,{book:doc.id,title:doc.title,hay:nbFold([...e.text,e.note,doc.title,doc.author].join(' '))})))
    .sort((a,b)=>(b.at||0)-(a.at||0));
  const bk=[...new Map(NB.items.map(e=>[e.book,e.title]))].sort((a,b)=>a[1].localeCompare(b[1]));
  $('#nbBook').innerHTML='<option value="">All books</option>'+bk.map(([id,t])=>`<option value="${id}">${esc(t)}</option>`).join('');
  const n=NB.items.length;
  $('#nbStats').innerHTML=n?`${nbCount(n,'highlight')} · ${nbCount(NB.items.filter(e=>e.note).length,'note')} · ${nbCount(bk.length,'book')}`:'';
  $('#nbCtrl').classList.toggle('hidden',!n);
  renderNotebook();
}
function renderNotebook(){
  if(!NB.items.length){$('#nbList').innerHTML='<div class="empty">No highlights yet.<br>Select any passage while reading and pick a color.</div>';return;}
  const terms=nbFold($('#nbQ').value).split(/\s+/).filter(Boolean),book=$('#nbBook').value;
  const base=NB.items.filter(e=>(!book||e.book===book)&&terms.every(t=>e.hay.includes(t)));
  const counts={note:base.filter(e=>e.note).length};base.forEach(e=>counts[e.color]=(counts[e.color]||0)+1);
  const chip=(f,label,sw)=>counts[f]||NB.f===f?`<button class="chip" aria-pressed="${NB.f===f}" data-f="${f}">${sw?`<i style="background:var(--${f}S)"></i>`:''}${label} ${counts[f]||0}</button>`:'';
  $('#nbChips').innerHTML=`<button class="chip" aria-pressed="${NB.f==='all'}" data-f="all">All ${base.length}</button>`+chip('note','With note')+BY_MEANING.map(c=>chip(c,esc(meaning(c)),true)).join('');
  const list=base.filter(e=>NB.f==='all'||(NB.f==='note'?e.note:e.color===NB.f));
  const card=e=>`<div class="hcard" style="border-left-color:var(--${e.color}S)" tabindex="0" data-book="${e.book}" data-hl="${e.id}"><div class="sec"><b>${esc(e.title)}</b>${e.section?` · ${esc(e.section)}`:''}</div><p class="q">${e.text.map(esc).join(' <span style="color:var(--muted)">¶</span> ')}</p>${e.note?`<div class="nt">${esc(e.note)}</div>`:''}</div>`;
  $('#nbList').innerHTML=!list.length?'<div class="empty">Nothing matches.</div>'
    :prefs.hlGroup==='color'?byColor(list).map(([c,l])=>colorHead(c,l.length)+l.map(card).join('')).join(''):list.map(card).join('');
}
const nbOpen=c=>{if(c&&getSelection().isCollapsed) openBook(c.dataset.book,{hl:c.dataset.hl});};
$('#nbBack').onclick=goShelf;
$('#nbQ').oninput=renderNotebook;
$('#nbBook').onchange=renderNotebook;
$('#nbChips').onclick=e=>{const b=e.target.closest('[data-f]');if(!b)return;NB.f=b.dataset.f;renderNotebook();};
$('#nbGroup').onclick=e=>groupBy(e,renderNotebook);
$('#nbExp').onclick=()=>openExport('shelf');
$('#nbList').onclick=e=>nbOpen(e.target.closest('[data-hl]'));
$('#nbList').onkeydown=e=>{if(e.key==='Enter') nbOpen(e.target.closest('[data-hl]'));};
// Two tabs: Highlights (above) and Words (see vocabulary). The last one picked opens next time; opening resets its filters.
function nbTab(tab,opening){
  const wd=tab==='wd';
  if(prefs.nbTab!==tab){prefs.nbTab=tab;savePrefs();}
  $('#nbTabHl').setAttribute('aria-selected',!wd);$('#nbTabWd').setAttribute('aria-selected',wd);
  $('#nbTabHl').tabIndex=wd?-1:0;$('#nbTabWd').tabIndex=wd?0:-1;
  $('#nbPanelHl').classList.toggle('hidden',wd);$('#nbPanelWd').classList.toggle('hidden',!wd);
  $('#nbStats').classList.toggle('hidden',wd);$('#wdStats').classList.toggle('hidden',!wd);
  if(opening){$('#wdQ').value='';$('#wdBook').value='';WD.f='all';}
  if(wd) openWords(opening);
}
$('#nbTabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b&&b.getAttribute('aria-selected')!=='true') nbTab(b.dataset.tab);};
$('#nbTabs').onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;const t=prefs.nbTab==='wd'?'hl':'wd';nbTab(t);$(t==='wd'?'#nbTabWd':'#nbTabHl').focus();};

/* ================= vocabulary ================= */
// Words saved from the reader with the sentences they were found in (format: vocab.js). The toolbar's Word saves the
// selection and shows its card; the meaning, synonyms, antonyms, examples and a picture are looked up in the
// background (see enrich); saved places are underlined in the text
// (inlineHTML); the Notebook's Words tab lists them all. WORDS caches the account's words (id → word): loaded on
// first use, kept in step with every change made here, and reloaded each time the Notebook opens.
let WORDS=null,wordsDb=null,wordsLoad=null,wordsWait=false;
let WIDX=null; // the open book's saved places by block id: {book, map: {pid: [{s, e, id, term}]}}
function loadWords(fresh){
  if(wordsDb!==DB){wordsDb=DB;WORDS=null;wordsLoad=null;WIDX=null;}
  if(fresh) wordsLoad=null;
  if(!wordsLoad){const db=DB;wordsLoad=db.all('word:').catch(()=>[]).then(list=>{if(db===DB){WORDS=new Map(list.filter(w=>w&&w.id).map(w=>[w.id,w]));WIDX=null;}return WORDS;});}
  return wordsLoad;
}
function putWord(w){WORDS.set(w.id,w);WIDX=null;DB.put('word:'+w.id,w);}
function wordIndex(){
  if(WIDX&&WIDX.book===DOC.id) return WIDX.map;
  const map={};
  WORDS.forEach(w=>(w.examples||[]).forEach(x=>{if(x.bookId===DOC.id)(map[x.pid]=map[x.pid]||[]).push({s:x.ws,e:x.we,id:w.id,term:w.term});}));
  WIDX={book:DOC.id,map};return map;
}
// For inlineHTML: the saved places in block b of the open book, where the text still reads the word. None until the
// words have loaded; the blocks that have some are drawn again once they arrive.
function wordSpans(b){
  if(!DOC||!b.text) return [];
  if(!WORDS||wordsDb!==DB){
    if(!wordsWait){wordsWait=true;loadWords().then(()=>{wordsWait=false;if(DOC&&WORDS) rerender(Object.keys(wordIndex()));});}
    return [];
  }
  return (wordIndex()[b.id]||[]).filter(x=>x.e>x.s&&termKey(b.text.slice(x.s,x.e))===termKey(x.term));
}

// The toolbar's Word: a word or a phrase of up to 4 words inside one block, stretched to whole words and without the
// punctuation around it, is saved with the sentence around it. No highlight is made.
const WCH=/[\p{L}\p{M}\p{N}]/u;
async function saveWordFromSel(segs){
  const seg=segs.length===1?segs[0]:null,b=seg&&blockIndex[seg.pid],t=b?b.text:'',isW=i=>i>=0&&i<t.length&&WCH.test(t[i]);
  let ws=seg?seg.s:0,we=seg?seg.e:0;
  while(isW(ws-1)&&isW(ws))ws--;
  while(isW(we)&&isW(we-1))we++;
  while(ws<we&&!isW(ws))ws++;
  while(we>ws&&!isW(we-1))we--;
  const raw=normTerm(t.slice(ws,we));
  if(!raw||raw.split(' ').length>4||raw.length>60){toast('Select a word or a short phrase');return;}
  const sel=getSelection(),rect=sel.rangeCount?sel.getRangeAt(0).getBoundingClientRect():null;
  sel.removeAllRanges();hideTool();
  const r=await saveWordAt(DOC,b,ws,we);if(!r) return; // signed out meanwhile
  if(!r.dup) rerender([b.id]);
  toast(r.dup?'Already in Words':'Saved to Words');
  openWordCard(r.w.id,r.ex,rect);
}
// Saves b.text[ws..we) of a book's block b as a word, with the sentence around it: a new word (no srs yet: new, and
// due), or one more example of a word already saved. Lower case, unless it's capitalised mid-sentence (likely a name).
// → {w, ex, dup}: dup when that place was saved before; null when signed out meanwhile.
async function saveWordAt(book,b,ws,we){
  const raw=normTerm(b.text.slice(ws,we));
  const ex=Object.assign(sentenceAround(b.text,ws,we),{bookId:book.id,pid:b.id,ws,we,title:book.title,at:Date.now()});
  const name=b.t!=='h'&&/^\p{Lu}/u.test(raw)&&/[\p{L}\p{N}]/u.test(ex.text.slice(0,ex.s));
  const term=name?raw:raw.toLowerCase(),id=wordId(term);
  await loadWords();if(!WORDS) return null;
  let w=WORDS.get(id);
  const dup=!!w&&(w.examples||[]).some(x=>x.bookId===ex.bookId&&x.pid===ex.pid&&x.ws===ex.ws);
  if(!w){w={id,term,def:'',pos:'',defSource:'',examples:[ex],added:ex.at};LOOKUP.delete(id);}
  else if(!dup) w.examples=[...(w.examples||[]),ex];
  if(!dup) putWord(w);
  return {w,ex,dup};
}

// A dictionary's JSON; soft: a 404 is null (nothing there). Throws when offline or the service fails.
async function getJSON(url,soft){const r=await fetch(url,{signal:AbortSignal.timeout?.(8000)});if(r.ok) return r.json();if(soft&&r.status===404) return null;throw new Error('HTTP '+r.status);}
// Meanings: Datamuse, then Datamuse on simple base forms ("ships" → "ship"), then Wiktionary.
// → {def, pos, defSource}; null when none of them has the word; undefined when offline or a service failed.
async function lookUp(term){
  if(navigator.onLine===false) return;
  try{
    for(const f of [term,...baseForms(term)]){const d=parseDatamuse(await getJSON(datamuseUrl(f)));if(d) return d;}
    return parseWiktionary(await getJSON(wiktionaryUrl(term),true));
  }catch(e){return;}
}
// One lookup per word and session: 'busy', 'done', 'none' (nothing found; tried again after a reload) or 'fail'
// (offline or a service failed; tried again the next time the word is shown). Saving never waits for it.
const LOOKUP=new Map();
function fillDef(w){
  const st=LOOKUP.get(w.id);if(isFact(w)||w.def||(st&&st!=='fail')) return;
  LOOKUP.set(w.id,'busy');
  lookUp(w.term).then(d=>{
    LOOKUP.set(w.id,d?'done':d===null?'none':'fail');
    const cur=WORDS&&WORDS.get(w.id);if(!cur) return;
    if(d&&!cur.def){cur.def=d.def;cur.pos=d.pos||cur.pos||'';cur.defSource=d.defSource;putWord(cur);}
    showDef(cur);
  });
  showDef(w);
}
const defPh=w=>({busy:'Looking up the meaning…',none:'No meaning found. Write your own.',fail:'Couldn’t look it up. Write your own.'})[LOOKUP.get(w.id)]||'Write the meaning';
const srcText=w=>w.def&&w.defSource?'from '+w.defSource:'';
// A meaning typed by hand is no longer the dictionary's; its line breaks stay (cleanText). → whether it changed.
function setDef(w,v){v=cleanText(v);if(v===(w.def||'')) return false;w.def=v;w.defSource='';putWord(w);return true;}
// A lookup's result, in the open card and the Words tab; a meaning already typed there stays.
function showDef(w){
  if(CARD&&CARD.id===w.id){
    const ta=$('#wbDef');if(!ta.value.trim()&&w.def) ta.value=w.def;
    ta.placeholder=defPh(w);$('#wbPos').textContent=w.pos||'';$('#wbSrc').textContent=srcText(w);
  }
  const c=document.querySelector(`#wdList .wcard[data-id="${w.id}"]`);if(!c) return;
  const d=c.querySelector('.w-def');if(!d.textContent.trim()&&w.def) d.textContent=w.def;
  d.dataset.ph=defPh(w);c.querySelector('.w-pos').textContent=w.pos||'';c.querySelector('.w-src').textContent=srcText(w);
}
const exampleHTML=x=>esc(x.text.slice(0,x.s))+'<b>'+esc(x.text.slice(x.s,x.e))+'</b>'+esc(x.text.slice(x.e));

/* pictures, synonyms, antonyms and the dictionary's examples (format: vocab.js) */
// Looked up once per card and source: when a word is saved or a fact card made, and for older cards the first time
// they're shown without them. Wikipedia gives the picture (a fact card's comes from its blank), Datamuse the synonyms
// and antonyms, Wiktionary the examples (and synonyms and antonyms when Datamuse has none). w.tried keeps each source's
// query once it answered, found or not, so a miss isn't asked again; a failure (offline, a service down) is tried
// again the next time the card is shown. Two cards look up at a time; saving never waits.
const PIC_MAX=3,WORD_BYTES=800*1024; // Firestore takes documents up to 1 MiB
const fits=w=>new TextEncoder().encode(JSON.stringify(w)).length<=WORD_BYTES;
const lookupQ=w=>termKey(isFact(w)?(factCloze(w)||{}).phrase:w.term);
// the sources a card still needs
function needs(w){
  const q=lookupQ(w),t=w.tried||{},none=k=>!(w[k]||[]).length,out=[];
  if(!q) return out;
  if(none('pics')&&t.wiki!==q) out.push('wiki');
  if(!isFact(w)&&(none('syn')||none('ant'))&&t.muse!==q) out.push('muse');
  if(!isFact(w)&&(none('dex')||none('syn')||none('ant'))&&t.wikt!==q) out.push('wikt');
  return out;
}
// Each source → what it found; null when it has nothing; undefined when it failed.
async function findPic(q){
  try{
    const s=parseWikiSummary(await getJSON(wikiSummaryUrl(q),true),q);if(!s) return null;
    const r=await fetch(s.src,{signal:AbortSignal.timeout?.(8000)});if(!r.ok) throw new Error('HTTP '+r.status);
    const src=await shrinkPic(await r.blob());
    return src?{src,credit:{title:s.title,url:s.url}}:null;
  }catch(e){return;}
}
async function findNyms(q){try{const [syn,ant]=await Promise.all(['syn','ant'].map(async r=>parseDatamuseWords(await getJSON(datamuseRelUrl(q,r)),q)));return {syn,ant};}catch(e){return;}}
async function findWikt(q){try{return parseWikitext(await getJSON(wikitextUrl(q),true),q);}catch(e){return;}}
const BUSY=new Set();
async function enrich(id){
  let w=WORDS&&WORDS.get(id);const want=w?needs(w):[];
  if(!want.length||BUSY.has(id)||navigator.onLine===false) return;
  BUSY.add(id);
  const q=lookupQ(w),db=DB,has=s=>want.includes(s);
  const [pic,nyms,wk]=await Promise.all([has('wiki')&&findPic(q),has('muse')&&findNyms(q),has('wikt')&&findWikt(q)]);
  BUSY.delete(id);
  w=db===DB&&WORDS&&WORDS.get(id);if(!w) return;
  const tried={...(w.tried||{})},none=k=>!(w[k]||[]).length;let changed=false;
  const got=(s,r)=>{if(!has(s)||r===undefined) return null;tried[s]=q;return r;}; // a failed source isn't marked tried
  const p=got('wiki',pic),m=got('muse',nyms),x=got('wikt',wk);
  if(p&&none('pics')&&fits({...w,pics:[p]})){w.pics=[p];changed=true;}
  ['syn','ant'].forEach(k=>{const l=m&&m[k].length?m[k]:x?x[k]:[];if(none(k)&&l.length){w[k]=l;changed=true;}});
  if(x&&none('dex')&&x.dex.length){w.dex=x.dex;changed=true;}
  if(!changed&&JSON.stringify(tried)===JSON.stringify(w.tried||{})) return;
  w.tried=tried;putWord(w);showExtras(w);
}
const FILLQ=[];let filling=0;
function queueFill(w,first){
  if(w&&needs(w).length&&!BUSY.has(w.id)&&!FILLQ.includes(w.id)) first?FILLQ.unshift(w.id):FILLQ.push(w.id);
  while(filling<2&&FILLQ.length){filling++;enrich(FILLQ.shift()).catch(e=>console.warn('Lookup',e)).finally(()=>{filling--;queueFill();});}
}
// A picture for a card: at most 640 px on its long side, JPEG on white (a transparent PNG would turn black), about
// 50–100 KB, redone smaller when it's still large. → a data URL, or null when it can't be read.
function shrinkPic(blob){
  return new Promise(res=>{
    const u=URL.createObjectURL(blob),img=new Image();
    img.onerror=()=>{URL.revokeObjectURL(u);res(null);};
    img.onload=()=>{
      URL.revokeObjectURL(u);const W=img.naturalWidth,H=img.naturalHeight;if(!W||!H){res(null);return;}
      const draw=(max,q)=>{const k=Math.min(1,max/Math.max(W,H)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(W*k));c.height=Math.max(1,Math.round(H*k));
        const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',q);};
      let d=draw(640,.8);if(d.length>140*1024) d=draw(480,.7);res(d);
    };
    img.src=u;
  });
}
// Pictures pasted, dropped or picked, up to 3 a card, each keeping the card well under Firestore's limit.
async function addPics(id,files){
  const w=id&&WORDS&&WORDS.get(id),imgs=[...files].filter(f=>f&&/^image\//.test(f.type));if(!w) return;
  if(!imgs.length){toast('That isn’t a picture');return;}
  let n=0,why='';
  for(const f of imgs){
    if((w.pics||[]).length>=PIC_MAX){why='Up to 3 pictures';break;}
    const src=await shrinkPic(f);if(!src){why='Couldn’t read that picture';continue;}
    const pics=[...(w.pics||[]),{src}];
    if(!fits({...w,pics})){why='Too big for this card';break;}
    w.pics=pics;n++;
  }
  if(n){putWord(w);showExtras(w);}
  toast(why||(n>1?`${n} pictures added`:'Picture added'));
}
function removePic(id,i){const w=WORDS&&WORDS.get(id);if(!w||!(w.pics||[])[i]) return;w.pics=w.pics.filter((_,j)=>j!==i);putWord(w);showExtras(w);toast('Picture removed');}
// Synonyms or antonyms as "a, b", examples one a line (vocab.js). → whether they changed.
function setExtra(w,k,text){
  const v=k==='dex'?parseExamples(text,w.dex,w.term):parseList(text);
  if(JSON.stringify(v)===JSON.stringify(w[k]||[])) return false;
  w[k]=v;putWord(w);return true;
}
// A card's extras, in the word card and the Words tab: the dictionary's examples, synonyms and antonyms (edited in
// place like the meaning; hidden when empty), the pictures (× removes one; the src is set by setPics), and Add for what's
// missing: a section to type in, or a picture. A fact card has only pictures.
const XL={dex:'Examples',syn:'Synonyms',ant:'Antonyms'};
const markWord=x=>x.e>x.s&&x.e<=x.text.length?exampleHTML(x):esc(x.text);
function extraHTML(w,k){
  if(k==='pics'){
    const ps=(w.pics||[]).map((p,i)=>[p,i]).filter(([p])=>p&&/^data:image\//.test(p.src||''));
    return `<div class="w-pics${ps.length?'':' hidden'}" data-x="pics">${ps.map(([p,i])=>`<figure class="w-pic"><img alt="${esc(p.credit?p.credit.title:'')}" data-pi="${i}"><button class="w-unpic" data-unpic="${i}" aria-label="Remove this picture">×</button>`+
      (p.credit&&/^https:\/\//.test(p.credit.url||'')?`<figcaption><a href="${esc(p.credit.url)}" target="_blank" rel="noopener">Wikipedia</a></figcaption>`:'')+'</figure>').join('')}</div>`;
  }
  if(k==='add'){
    const miss=isFact(w)?[]:['dex','syn','ant'].filter(k=>!(w[k]||[]).length),pic=(w.pics||[]).length<PIC_MAX;
    return `<div class="w-add" data-x="add">${miss.length||pic?'<span class="w-addl">Add</span>':''}${miss.map(k=>`<button class="w-addb" data-add="${k}">${k==='dex'?'Example':XL[k]}</button>`).join('')}`+
      (pic?'<label class="w-addb">Picture<input type="file" accept="image/*" multiple class="w-file"></label>':'')+'</div>';
  }
  const v=w[k]||[],val=k==='dex'?v.map(x=>markWord(x)+(x.cite?`<span class="wx-cite"> — ${esc(x.cite)}</span>`:'')).join('\n'):esc(v.join(', '));
  return `<section class="wx${v.length?'':' hidden'}" data-x="${k}"><h4 class="w-lbl">${XL[k]}</h4><p class="wx-f" data-k="${k}" contenteditable="plaintext-only" role="textbox" aria-label="${XL[k]} of ${esc(w.term)}"${k==='dex'?' aria-multiline="true" data-ph="One a line"':' data-ph="Separate them with commas"'}>${val}</p></section>`;
}
const setPics=(root,w)=>root.querySelectorAll('img[data-pi]').forEach(im=>{const p=(w.pics||[])[+im.dataset.pi];if(p) im.src=p.src;});
// Redraws a card's extras where it shows (the word card, the Words tab), except a field being edited; `only` some.
function showExtras(w,only){
  const box=CARD&&CARD.id===w.id?$('#wordBox'):null,c=document.querySelector(`#wdList .wcard[data-id="${CSS.escape(w.id)}"]`);
  [box,c].filter(Boolean).forEach(r=>r.querySelectorAll('[data-x]').forEach(el=>{
    const k=el.dataset.x,f=el.querySelector('.wx-f');
    if((only&&!only.includes(k))||(f&&(f.dataset.dirty||f===document.activeElement))) return;
    el.outerHTML=extraHTML(w,k);
    if(k==='pics') setPics(r.querySelector('[data-x="pics"]'),w);
  }));
  if(box) CARD.at=placeCard(box,CARD.at); // grown: still inside the visible area
}
// Add: shows an empty section to type in.
function revealExtra(root,k){
  const s=root.querySelector(`[data-x="${k}"]`);if(!s) return;
  s.classList.remove('hidden');root.querySelector(`[data-add="${k}"]`)?.remove();
  if(root.id==='wordBox') CARD.at=placeCard(root,CARD.at);
  s.querySelector('.wx-f').focus();
}
// A picture pasted into a card (when the clipboard holds no text, which goes into the field as usual).
function pastePics(e){
  const host=e.target.closest&&e.target.closest('#wordBox,#wdList .wcard[data-id]'),cd=e.clipboardData;
  if(!host||!cd||(cd.getData('text/plain')||'').trim()) return;
  const fs=[...(cd.files||[])];if(!fs.length) [...(cd.items||[])].forEach(i=>{if(i.kind==='file'){const f=i.getAsFile();if(f) fs.push(f);}});
  const imgs=fs.filter(f=>/^image\//.test(f.type));if(!imgs.length) return;
  e.preventDefault();addPics(host.id==='wordBox'?CARD&&CARD.id:host.dataset.id,imgs);
}
const lightbox=src=>{$('#lightbox img').src=src;$('#lightbox').classList.remove('hidden');};
// the clicks, pastes and picks that both places share; → true when handled
function extrasClick(e,root,id){
  const add=e.target.closest('[data-add]');if(add){revealExtra(root,add.dataset.add);return true;}
  const un=e.target.closest('[data-unpic]');if(un){removePic(id,+un.dataset.unpic);return true;}
  const im=e.target.closest('img[data-pi]');if(im){lightbox(im.src);return true;}
  return false;
}
['#wordBox','#wdList'].forEach(s=>{
  const el=$(s);
  el.addEventListener('paste',pastePics);
  el.addEventListener('input',e=>{const f=e.target.closest&&e.target.closest('.wx-f');if(f) f.dataset.dirty='1';});
  el.addEventListener('change',e=>{
    if(!e.target.matches('.w-file')) return;
    const id=s==='#wordBox'?CARD&&CARD.id:e.target.closest('.wcard').dataset.id;addPics(id,e.target.files);e.target.value='';
  });
});

// The word card: term, part of speech, the meaning to edit, the dictionary's examples, synonyms and antonyms, the
// pictures, and the sentence from your reading (the one at `at`, else the newest).
let CARD=null; // {id, at: where placeCard put it} while open
function openWordCard(id,at,rect){
  const w=WORDS&&WORDS.get(id);if(!w) return;
  const exs=w.examples||[],ex=(at&&exs.find(x=>x.bookId===at.bookId&&x.pid===at.pid&&x.ws===at.ws))||exs[exs.length-1];
  CARD={id};
  const box=$('#wordBox');
  $('#wbTerm').textContent=w.term;$('#wbDef').value=w.def||'';$('#wbEx').innerHTML=ex?exampleHTML(ex):'';$('#wbRead').classList.toggle('hidden',!ex);
  box.querySelectorAll('[data-x]').forEach(el=>{el.outerHTML=extraHTML(w,el.dataset.x);});setPics(box,w);$('#wbMore').scrollTop=0;
  showDef(w);fillDef(w);
  box.classList.remove('hidden');box.style.maxHeight='';
  // docked at the bottom on phones, like the toolbar; elsewhere under the word, or above it near the bottom
  let to=null;
  if(!(coarse||!rect||innerWidth<600)){
    const bw=box.offsetWidth,bh=box.offsetHeight;let top=rect.bottom+12;if(top+bh>innerHeight-12) top=Math.max(70,rect.top-bh-12);
    to={x:rect.left+rect.width/2-bw/2,y:top};
  }
  CARD.at=placeCard(box,to);
  queueFill(w,true);
}
function closeWordCard(){$('#wordBox').classList.add('hidden');CARD=null;}
// Dragging the card by its head moves it anywhere inside the visible area, until it closes.
let wbDrag=null;
const wbHead=$('#wordBox .wb-head'),endWbDrag=()=>{wbDrag=null;$('#wordBox').classList.remove('drag');};
wbHead.addEventListener('pointerdown',e=>{
  if(!CARD||e.button) return;
  const r=$('#wordBox').getBoundingClientRect();
  wbDrag={id:e.pointerId,dx:e.clientX-r.left,dy:e.clientY-r.top};
  wbHead.setPointerCapture(e.pointerId);$('#wordBox').classList.add('drag');e.preventDefault(); // the field keeps focus
});
wbHead.addEventListener('pointermove',e=>{if(wbDrag&&CARD&&e.pointerId===wbDrag.id) CARD.at=placeCard($('#wordBox'),{x:e.clientX-wbDrag.dx,y:e.clientY-wbDrag.dy});});
wbHead.addEventListener('pointerup',endWbDrag);wbHead.addEventListener('pointercancel',endWbDrag);
// Both cards follow the visible area: the keyboard opening or closing, iOS panning to the field, a resize.
function keepCardsInView(){
  const nb=$('#noteBox');
  if(!nb.classList.contains('hidden')) noteAt=placeCard(nb,noteAt);
  if(CARD) CARD.at=placeCard($('#wordBox'),CARD.at);
}
window.visualViewport?.addEventListener('resize',keepCardsInView);window.visualViewport?.addEventListener('scroll',keepCardsInView);
addEventListener('resize',keepCardsInView);
$('#wbClose').onclick=closeWordCard;
// Save keeps what was typed (Close drops it); pictures are kept as soon as they're added or removed
$('#wbSave').onclick=()=>{
  const w=CARD&&WORDS&&WORDS.get(CARD.id);
  if(w){
    const d=setDef(w,$('#wbDef').value),x=[...document.querySelectorAll('#wordBox .wx-f')].filter(f=>setExtra(w,f.dataset.k,f.innerText)).length;
    if(d||x) toast(x?'Saved':'Meaning saved');
  }
  closeWordCard();
};
$('#wordBox').addEventListener('click',e=>{if(CARD) extrasClick(e,$('#wordBox'),CARD.id);});
document.addEventListener('keydown',e=>{if(e.key==='Escape') closeWordCard();});
$('#bHome').addEventListener('click',closeWordCard);
// Tapping a saved word in the text opens its card. Capture: a word inside a highlight opens its card, not the toolbar.
$('#col').addEventListener('click',e=>{
  const u=e.target.closest('.wd');if(!u||!DOC||!getSelection().isCollapsed||e.target.closest('a')) return;
  e.stopPropagation();hideTool();
  const p=u.closest('[data-pid]');
  openWordCard(u.dataset.w,{bookId:DOC.id,pid:p&&p.dataset.pid,ws:+u.dataset.ws},u.getBoundingClientRect());
},true);

// The Notebook's Words tab: every word and fact card, newest first, with search, a book filter and Study. Chips pick
// All, Words, Facts or To sort (coral highlights waiting to become words or fact cards, see below).
let WD={run:0,f:'all'};
const wordBook=x=>(META.find(m=>m.id===x.bookId)||x).title||'';
// Shows the cached words at once; fresh: reloads them too (other devices, a restored backup) and redraws only on a
// change, and not while a meaning is being edited.
const wordsSig=()=>JSON.stringify([...WORDS.values()].sort((a,b)=>a.id<b.id?-1:1),(k,v)=>k==='src'&&typeof v==='string'?v.length+v.slice(-24):v); // a picture by its length and end
async function openWords(fresh){
  const run=++WD.run,ready=!!WORDS&&wordsDb===DB,shown=ready?wordsSig():null;
  if(ready) renderWords();
  else{$('#wdStats').innerHTML='';$('#wdCtrl').classList.add('hidden');$('#wdList').innerHTML='<div class="empty">Gathering your words…</div>';}
  if(ready&&!fresh) return;
  await loadWords(fresh);
  if(run===WD.run&&prefs.nbTab==='wd'&&WORDS&&wordsSig()!==shown&&!$('#wdList').contains(document.activeElement)) renderWords();
}
function renderWords(){
  const all=WORDS?[...WORDS.values()]:[],now=Date.now(),nf=all.filter(isFact).length;
  $('#wdStats').innerHTML=all.length?[all.length>nf&&nbCount(all.length-nf,'word'),nf&&nbCount(nf,'fact'),`<b>${all.filter(w=>isDue(w.srs,now)).length}</b> due`].filter(Boolean).join(' · '):'';
  $('#wdStudy').classList.toggle('hidden',typeof openStudy!=='function'); // the Study screen defines openStudy
  // the book filter lists the books of what the chip shows
  const books=new Map(),add=(id,t)=>{if(!books.has(id)) books.set(id,t);};
  if(WD.f==='sort') (SORT.items||[]).forEach(it=>add(it.bookId,it.title));
  else all.forEach(w=>isFact(w)?add(w.bookId,wordBook(w)):(w.examples||[]).forEach(x=>add(x.bookId,wordBook(x))));
  const sel=$('#wdBook'),cur=sel.value;
  sel.innerHTML='<option value="">All books</option>'+[...books].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,t])=>`<option value="${esc(id)}">${esc(t)}</option>`).join('');
  sel.value=books.has(cur)?cur:'';
  wdChips();listWords();
}
// The chips, To sort with how many highlights wait (within the search and book filter). The controls show once there
// are words, fact cards or coral highlights.
const WD_CHIPS=[['all','All'],['words','Words'],['facts','Facts'],['sort','To sort']];
function wdChips(){
  const n=SORT.items?sortBase().filter(it=>!it.h.study).length:null;
  $('#wdCtrl').classList.toggle('hidden',!(WORDS&&WORDS.size)&&!(SORT.items&&SORT.items.length));
  $('#wdChips').innerHTML=WD_CHIPS.map(([f,l])=>`<button class="chip" aria-pressed="${WD.f===f}" data-f="${f}">${l}${f==='sort'&&n!==null?` (${n})`:''}</button>`).join('');
}
// A fact card in the list: its text with the blanked phrase marked, where it's from (opens the highlight), its note,
// its pictures. A card takes focus (tabindex -1), so a picture can be pasted into it.
const factQ=f=>{const c=factCloze(f);return c?esc(c.before)+`<span class="f-gap">${esc(c.phrase)}</span>`+esc(c.after):esc(f.text||'');};
const factFrom=f=>[wordBook(f),f.section].filter(Boolean).join(' · ');
const factHTML=f=>`<article class="wcard fcard" data-id="${esc(f.id)}" tabindex="-1"><div class="w-head"><span class="f-tag">Fact</span><button class="w-del" data-a="del" aria-label="Delete this fact card">Delete</button></div>`+
  `<button class="w-ex" data-book="${esc(f.bookId)}" data-hl="${esc(f.hlId)}" data-pid="${esc(f.pid)}"><span class="w-q">${factQ(f)}</span><span class="w-bk">${esc(factFrom(f))}</span></button>`+
  (f.note?`<p class="f-note">${esc(f.note)}</p>`:'')+extraHTML(f,'pics')+extraHTML(f,'add')+'</article>';
// A word: its meaning, the dictionary's examples, synonyms, antonyms and pictures, then the sentences from your reading.
const wordHTML=w=>{
  const xs=w.examples||[];
  return `<article class="wcard" data-id="${esc(w.id)}" tabindex="-1"><div class="w-head"><h3 class="w-term">${esc(w.term)}</h3><span class="w-pos">${esc(w.pos||'')}</span><button class="w-del" data-a="del" aria-label="Delete “${esc(w.term)}”">Delete</button></div>`+
    `<p class="w-def" contenteditable="plaintext-only" role="textbox" aria-label="Meaning of ${esc(w.term)}" data-ph="${esc(defPh(w))}">${esc(w.def||'')}</p><p class="w-src">${esc(srcText(w))}</p>`+
    ['dex','syn','ant','pics'].map(k=>extraHTML(w,k)).join('')+(xs.length?'<h4 class="w-lbl">From your reading</h4>':'')+
    xs.map(x=>`<button class="w-ex" data-book="${esc(x.bookId)}" data-pid="${esc(x.pid)}" data-ws="${x.ws}"><span class="w-q">${exampleHTML(x)}</span><span class="w-bk">${esc(wordBook(x))}</span></button>`).join('')+extraHTML(w,'add')+'</article>';
};
// Older cards look up their pictures, synonyms, antonyms and examples once they're on screen (see enrich).
const wdSeen=typeof IntersectionObserver==='function'?new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting) return;wdSeen.unobserve(e.target);queueFill(WORDS&&WORDS.get(e.target.dataset.id));}),{rootMargin:'200px 0px'}):null;
function listWords(){
  wdSeen?.disconnect();
  if(WD.f==='sort') return listSort();
  const all=WORDS?[...WORDS.values()]:[],facts=WD.f==='facts',mine=all.filter(w=>WD.f==='all'||isFact(w)===facts);
  if(!mine.length){$('#wdList').innerHTML=facts?'<div class="empty">No fact cards yet.<br>Make them from your coral highlights in To sort.</div>':'<div class="empty">No words yet.<br>Select a word while reading and tap Word.</div>';return;}
  const terms=nbFold($('#wdQ').value).split(/\s+/).filter(Boolean),book=$('#wdBook').value;
  const list=mine.filter(w=>{
    const f=isFact(w);if(book&&!(f?w.bookId===book:(w.examples||[]).some(x=>x.bookId===book))) return false;
    const h=nbFold((f?[w.text,w.note,wordBook(w),w.section]:[w.term,w.def,...(w.syn||[]),...(w.ant||[]),...(w.examples||[]).map(x=>x.text)]).join(' '));return terms.every(t=>h.includes(t));
  }).sort((a,b)=>(b.added||0)-(a.added||0));
  $('#wdList').innerHTML=list.length?list.map(w=>isFact(w)?factHTML(w):wordHTML(w)).join(''):'<div class="empty">Nothing matches.</div>';
  $('#wdList').querySelectorAll('.wcard[data-id]').forEach(c=>{const w=WORDS.get(c.dataset.id);if(w) setPics(c,w);wdSeen?.observe(c);});
  list.forEach(fillDef);
}
// Deleting asks nothing: the whole word or fact card goes to the Trash, and Restore puts it back. A fact card's
// highlight stays sorted.
function deleteWord(id){
  const w=WORDS&&WORDS.get(id);if(!w) return;
  const tr=toTrash('word',{title:isFact(w)?wordBook(w):w.term,word:w});
  WORDS.delete(id);WIDX=null;DB.del('word:'+id);movedToTrash(tr);
}
// A word back from the Trash. Saved again meanwhile: its examples are merged in, and the newer copy keeps its meaning
// and flashcard schedule unless it has none, and its pictures, synonyms, antonyms and dictionary examples unless it
// lacks them. A fact card made again meanwhile is the newer one and stays, with the old one's pictures if it has none.
async function restoreWord(w){
  await loadWords();
  const have=await DB.get('word:'+w.id);
  if(have&&isFact(w)) w=mergeExtras(have,w)||have;
  else if(have){
    const key=x=>[x.bookId,x.pid,x.ws].join('|'),seen=new Set((have.examples||[]).map(key)),now=Date.now();
    w={...(mergeExtras(have,w)||have),def:have.def||w.def||'',pos:have.def?have.pos:(w.pos||have.pos||''),defSource:have.def?have.defSource:(w.defSource||''),
      examples:[...(w.examples||[]).filter(x=>!seen.has(key(x))),...(have.examples||[])].sort((a,b)=>(a.at||0)-(b.at||0)),
      added:Math.min(have.added||now,w.added||now),srs:have.srs||w.srs};
  }
  putWord(w);
}
// An example's book, opened at the word: scrolled to the middle and flashed, like a highlight opened from the Notebook.
async function openAtWord(bookId,pid,ws,id){
  if(!META.some(m=>m.id===bookId)){toast('That book isn’t on your shelf any more');return;}
  await openBook(bookId);if(!DOC||DOC.id!==bookId) return;
  requestAnimationFrame(()=>{ // after openBook's own scroll to the reading position
    const p=[...document.querySelectorAll(`#col .hp[data-pid="${CSS.escape(pid)}"]`)].find(x=>!x.closest('.fn-card'));if(!p) return;
    const us=[...p.querySelectorAll(`.wd[data-w="${CSS.escape(id)}"][data-ws="${ws}"]`)];
    (us[0]||p).scrollIntoView({block:'center'});
    us.forEach(u=>{u.classList.remove('flash');void u.offsetWidth;u.classList.add('flash');});
  });
}
// A fact card's highlight, opened in its book (scrolled to and flashed); its first block when the highlight is gone.
async function openAtHl(bookId,hlId,pid){
  if(!META.some(m=>m.id===bookId)){toast('That book isn’t on your shelf any more');return;}
  await openBook(bookId,{hl:hlId});if(!DOC||DOC.id!==bookId||HL.some(h=>h.id===hlId)) return;
  requestAnimationFrame(()=>{const p=document.querySelector(`#col .hp[data-pid="${CSS.escape(pid)}"]`);if(p) p.scrollIntoView({block:'center'});});
}
$('#wdQ').oninput=()=>{wdChips();listWords();};
$('#wdBook').onchange=()=>{wdChips();listWords();};
$('#wdStudy').onclick=()=>{if(typeof openStudy==='function') openStudy();};
// leaving To sort ends its visit: what was sorted there can't be undone any more
$('#wdChips').onclick=e=>{const b=e.target.closest('[data-f]');if(!b||b.dataset.f===WD.f) return;if(WD.f==='sort') SORT=sortReset(SORT.items);WD.f=b.dataset.f;renderWords();};
$('#wdList').addEventListener('click',e=>{
  const sc=e.target.closest('.scard');if(sc){sortClick(e,sc);return;}
  const st=e.target.closest('[data-st]');if(st){if(st.dataset.st==='skipped'){SORT.skipped=!SORT.skipped;listSort();}else if(st.dataset.st==='rest') sortRest();return;}
  const c=e.target.closest('.wcard');if(!c) return;
  if(e.target.closest('[data-a="del"]')){deleteWord(c.dataset.id);renderWords();return;}
  if(extrasClick(e,c,c.dataset.id)) return;
  const x=e.target.closest('.w-ex');if(!x||!getSelection().isCollapsed) return;
  if(x.dataset.hl) openAtHl(x.dataset.book,x.dataset.hl,x.dataset.pid); else openAtWord(x.dataset.book,x.dataset.pid,+x.dataset.ws,c.dataset.id);
});
// the meaning, synonyms, antonyms and examples, edited in place: leaving one saves it, and so does Enter, except in
// the examples (one a line); Shift+Enter starts a new line in the meaning
$('#wdList').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&e.target.matches('.w-def,.wx-f:not([data-k="dex"])')){e.preventDefault();e.target.blur();}});
$('#wdList').addEventListener('focusout',e=>{
  const f=e.target.closest('.w-def,.wx-f'),c=f&&f.closest('.wcard'),w=c&&WORDS&&WORDS.get(c.dataset.id);if(!w) return;
  if(f.matches('.w-def')){
    if(setDef(w,f.innerText)){f.textContent=w.def;f.dataset.ph=defPh(w);c.querySelector('.w-src').textContent='';toast('Meaning saved');}
    return;
  }
  const k=f.dataset.k;delete f.dataset.dirty;
  if(setExtra(w,k,f.innerText)) toast(XL[k]+' saved');
  showExtras(w,[k,'add']); // an emptied section hides; Add follows
});

/* To sort: coral highlights become words or fact cards */
// Every coral highlight on the shelf waits in To sort until it's sorted: h.study = {as: 'words' | 'fact' | 'skip', at},
// kept on the highlight in its book's state (a merged Kindle export keeps it: see mergeKindle). Tapping a word in it
// saves the word, as the reader's Word does, and sorts it as words; Fact makes it a fact card, with the phrase selected
// in it blanked out; Skip hides it until "Show skipped". Deleting the word or card later doesn't bring it back.
// SORT, for one visit to To sort:
//   items    the coral highlights, newest books first, then in reading order; null until the books have loaded
//   keep     highlights sorted as words during the visit: they stay listed, with their chosen words and Undo
//   taps     per highlight, the words tapped in it, for Undo: [{id, term, pid, ws}]
//   prev     per highlight, its h.study before the first tap, put back when every tap is undone
//   blank    per highlight, the phrase selected for its fact card: {s, e} in the item's text
//   skipped  whether skipped highlights are listed too
let SORT=sortReset();
function sortReset(items=null){return {items,keep:new Set(),taps:new Map(),prev:new Map(),blank:new Map(),skipped:false};}
// From the books the Notebook read: each coral highlight with its text (its blocks joined with a space) and its words,
// each word's place in the text (a, z) and in its block (k: which segment, s, e).
function sortLoaded(books){
  const added=id=>(META.find(m=>m.id===id)||{}).added||0;
  SORT.items=[...books].sort((a,b)=>added(b.doc.id)-added(a.doc.id)).flatMap(({doc,hl})=>{
    const coral=hl.filter(h=>h.color==='coral');if(!coral.length) return [];
    const blocks={},byId=new Map(coral.map(h=>[h.id,h]));
    doc.blocks.forEach(b=>{if(b.text!==undefined) blocks[b.id]=b;});(doc.notes||[]).forEach(n=>{blocks[n.id]={id:n.id,text:n.text};});
    return entriesFor(doc,coral).map(e=>{
      const h=byId.get(e.id),segs=h.segs.filter(g=>blocks[g.pid]).map(g=>({pid:g.pid,s:g.s,e:g.e,b:blocks[g.pid]}));
      let text='';const toks=[];
      segs.forEach((g,k)=>{if(k) text+=' ';const t=g.b.text.slice(g.s,g.e),o=text.length;wordsIn(t).forEach(w=>toks.push({a:o+w.s,z:o+w.e,k,s:g.s+w.s,e:g.s+w.e}));text+=t;});
      return {key:doc.id+'|'+h.id,bookId:doc.id,title:doc.title,section:e.section,h,segs,text,toks,hay:nbFold([text,h.note,doc.title,doc.author].join(' '))};
    });
  });
  if($('#nbPanelWd').classList.contains('hidden')) return;
  if(WD.f==='sort') renderWords(); else wdChips();
}
// the highlights the search and book filter let through
function sortBase(){
  const terms=nbFold($('#wdQ').value).split(/\s+/).filter(Boolean),book=$('#wdBook').value;
  return (SORT.items||[]).filter(it=>(!book||it.bookId===book)&&terms.every(t=>it.hay.includes(t)));
}
// Where saved words sit in the books ("bookId|pid" → [[ws, we]]): a word saved there shows as chosen.
function wordPlaces(){const m=new Map();if(WORDS) WORDS.forEach(w=>(w.examples||[]).forEach(x=>{const k=x.bookId+'|'+x.pid;if(!m.has(k)) m.set(k,[]);m.get(k).push([x.ws,x.we]);}));return m;}
const chosenAt=(it,x,places)=>(places.get(it.bookId+'|'+it.segs[x.k].pid)||[]).some(([s,e])=>s<=x.s&&x.e<=e);
function listSort(){
  if(!SORT.items){$('#wdList').innerHTML='<div class="empty">Gathering your highlights…</div>';return;}
  const base=sortBase(),as=it=>it.h.study&&it.h.study.as,places=wordPlaces();
  const n=base.filter(it=>!as(it)).length,sk=base.filter(it=>as(it)==='skip').length;
  const list=base.filter(it=>!as(it)||SORT.keep.has(it.key)||(SORT.skipped&&as(it)==='skip'));
  const bar=list.length||sk||SORT.skipped?`<div class="st-bar">${list.length?'<p class="st-hint">Tap a word to save it. Select a phrase to blank it on the fact card.</p>':''}<span class="st-acts">${sk||SORT.skipped?`<button class="chip" data-st="skipped" aria-pressed="${SORT.skipped}">Show skipped (${sk})</button>`:''}${n?'<button class="btn ghost" data-st="rest">Make the rest facts</button>':''}</span></div>`:'';
  $('#wdList').innerHTML=bar+(list.length?list.map(it=>sortCardHTML(it,places)).join(''):
    `<div class="empty">${!SORT.items.length?'Nothing to sort.<br>Coral highlights wait here, Kindle’s red, pink and orange ones too.':!base.length?'Nothing matches.':'All sorted.'}</div>`);
}
// A highlight to sort: where it's from, its text with each word to tap (chosen ones marked, the blank boxed), its note,
// then Undo and Clear blank when they apply, Skip and Fact.
function sortCardHTML(it,places){
  const taps=SORT.taps.get(it.key)||[],b=SORT.blank.get(it.key),skipped=!!it.h.study&&it.h.study.as==='skip',t=it.text;
  let q='',at=0;
  it.toks.forEach((x,i)=>{
    q+=esc(t.slice(at,x.a))+(b&&x.a===b.s?'<span class="f-gap">':'')+`<span class="st-w${chosenAt(it,x,places)?' on':''}" data-t="${i}">${esc(t.slice(x.a,x.z))}</span>`+(b&&x.z===b.e?'</span>':'');
    at=x.z;
  });
  q+=esc(t.slice(at));
  const info=(taps.length?`<span>Saved: ${esc(taps.map(x=>x.term).join(', '))}</span><button class="sc-link" data-st="undo">Undo</button>`:'')+(b?'<button class="sc-link" data-st="clear">Clear blank</button>':'');
  return `<article class="wcard scard" data-k="${esc(it.key)}"><div class="sec"><b>${esc(it.title)}</b>${it.section?` · ${esc(it.section)}`:''}${skipped?' · Skipped':''}</div>`+
    `<p class="st-text">${q}</p>${it.h.note?`<p class="f-note">${esc(it.h.note)}</p>`:''}`+
    `<div class="sc-foot"><span class="sc-info">${info}</span><span class="sc-acts">${taps.length||skipped?'':'<button class="btn ghost" data-st="skip">Skip</button>'}<button class="btn" data-st="fact">Fact</button></span></div></article>`;
}
function sortClick(e,card){
  const it=SORT.items&&SORT.items.find(x=>x.key===card.dataset.k),b=e.target.closest('[data-st]');if(!it) return;
  if(b){const a=b.dataset.st;if(a==='fact') sortFact(it);else if(a==='skip') sortSkip(it);else if(a==='undo') sortUndo(it);else if(a==='clear'){SORT.blank.delete(it.key);listSort();}return;}
  const w=e.target.closest('.st-w');if(w&&getSelection().isCollapsed) sortTap(it,+w.dataset.t);
}
// A tapped word is saved like the reader's Word (its sentence from its block, its meaning looked up) and sorts the
// highlight as words; tapping it again, or Undo, takes it back.
async function sortTap(it,i){
  const x=it.toks[i],g=it.segs[x.k],mine=(SORT.taps.get(it.key)||[]).find(y=>y.pid===g.pid&&y.ws===x.s);
  if(mine) return sortUndo(it,mine);
  await loadWords();if(!WORDS) return;
  if(chosenAt(it,x,wordPlaces())){toast('Already in Words');return;}
  const r=await saveWordAt({id:it.bookId,title:it.title},g.b,x.s,x.e);if(!r) return;
  if(r.dup){toast('Already in Words');return;}
  fillDef(r.w);queueFill(r.w,true);
  const taps=SORT.taps.get(it.key)||[];
  if(!taps.length) SORT.prev.set(it.key,it.h.study||null);
  SORT.taps.set(it.key,[...taps,{id:r.w.id,term:r.w.term,pid:g.pid,ws:x.s}]);SORT.keep.add(it.key);
  if(!it.h.study||it.h.study.as!=='words') setStudy(it,{as:'words',at:Date.now()});
  toast('Saved to Words');listSort();wdChips();
}
// Takes back a tapped word (the last one by default): its example goes, and the word with it when that was its only one.
// With no tapped word left, the highlight is as it was before.
function sortUndo(it,tap){
  const taps=SORT.taps.get(it.key)||[];tap=tap||taps[taps.length-1];if(!tap) return;
  const w=WORDS&&WORDS.get(tap.id);
  if(w){
    const rest=(w.examples||[]).filter(x=>!(x.bookId===it.bookId&&x.pid===tap.pid&&x.ws===tap.ws));
    if(rest.length){w.examples=rest;putWord(w);} else {WORDS.delete(w.id);WIDX=null;DB.del('word:'+w.id);}
  }
  const left=taps.filter(y=>y!==tap);SORT.taps.set(it.key,left);
  if(!left.length){setStudy(it,SORT.prev.get(it.key)||null);SORT.prev.delete(it.key);}
  toast('Undone');listSort();wdChips();
}
async function sortFact(it){
  await loadWords();if(!WORDS) return;
  makeFact(it,SORT.blank.get(it.key));setStudy(it,{as:'fact',at:Date.now()});
  ['keep','taps','prev','blank'].forEach(k=>SORT[k].delete(it.key));
  toast('Made a fact card');listSort();wdChips();
}
function sortSkip(it){setStudy(it,{as:'skip',at:Date.now()});SORT.keep.delete(it.key);toast('Skipped');listSort();wdChips();}
// "Make the rest facts": every highlight listed and not sorted yet becomes a fact card (with its blank, if one was
// selected), in list order. It deletes nothing, so a plain question is enough.
async function sortRest(){
  const rest=sortBase().filter(it=>!it.h.study),n=rest.length;if(!n) return;
  if(!await confirmTyped(`Make ${n===1?'1 highlight a fact card':`${n} highlights fact cards`}?`,'Each one becomes a card to study. Nothing is deleted.','Make fact cards',true)) return;
  await loadWords();if(!WORDS) return;
  const at=Date.now(),v={as:'fact',at},by=new Map();
  rest.forEach((it,i)=>{
    makeFact(it,SORT.blank.get(it.key),at+i);it.h.study=v;SORT.blank.delete(it.key);
    if(!by.has(it.bookId)) by.set(it.bookId,new Set());by.get(it.bookId).add(it.h.id);
  });
  by.forEach((ids,id)=>editState(id,hl=>hl.forEach(h=>{if(ids.has(h.id)) h.study=v;}))); // one write per book
  toast(`Made ${plural(n,'fact card')}`);listSort();wdChips();
}
// A highlight's fact card (format: vocab.js), its picture looked up from its blank. Made again, it keeps its schedule
// and pictures.
function makeFact(it,blank,at=Date.now()){
  const id=factId(it.bookId,it.h.id),have=WORDS.get(id),g=it.segs[0]||{};
  putWord({...have,id,kind:'fact',text:it.text,blank:blank||null,note:it.h.note||'',bookId:it.bookId,hlId:it.h.id,pid:g.pid,ws:g.s,we:g.e,title:it.title,section:it.section||'',added:(have&&have.added)||at});
  queueFill(WORDS.get(id));
}
// Sorts a highlight (v: {as, at}, or null for not sorted): the list shows it at once, its book's state follows.
function setStudy(it,v){
  if(v) it.h.study=v; else delete it.h.study;
  editState(it.bookId,hl=>{const h=hl.find(x=>x.id===it.h.id);if(!h) return;if(v) h.study=v; else delete h.study;});
}
// Changes a book's highlights in its stored state: one change at a time per book, each made to the latest copy, so none
// is lost to another device or a merged Kindle export. The open book's highlights change in place.
const EDITS=new Map();
function editState(id,fn){
  const db=DB,p=(EDITS.get(id)||Promise.resolve()).then(async()=>{
    if(DOC&&DOC.id===id){fn(HL);commit();return;}
    const st=await db.get('state:'+id);if(!st||db!==DB) return;
    fn(st.hl=st.hl||[]);db.put('state:'+id,st);
  }).catch(e=>console.warn('Sorting',e));
  EDITS.set(id,p);return p;
}
// A phrase selected in a highlight's text becomes the blank on its fact card, stretched to whole words: with a mouse
// once the button is let go, otherwise (touch, keyboard) once the selection has settled. Never while a mouse button is
// down: a settle timer left from before the drag would take half the phrase and end the drag.
let stMouse=false;
function sortSelect(){
  if(stMouse||WD.f!=='sort'||$('#notebook').classList.contains('hidden')) return;
  const sel=getSelection();if(sel.isCollapsed||!sel.rangeCount) return;
  const r=sel.getRangeAt(0),el=n=>{const e=n.nodeType===1?n:n.parentElement;return e&&e.closest('#wdList .st-text');},tx=el(r.startContainer);
  if(!tx||tx!==el(r.endContainer)) return;
  const it=SORT.items&&SORT.items.find(x=>x.key===tx.closest('.scard').dataset.k);if(!it) return;
  const at=(n,o)=>{const q=document.createRange();q.setStart(tx,0);q.setEnd(n,o);return q.toString().length;};
  const b=snapWords(it.text,at(r.startContainer,r.startOffset),at(r.endContainer,r.endOffset));
  sel.removeAllRanges();if(!b) return;
  SORT.blank.set(it.key,b);listSort();
}
$('#wdList').addEventListener('pointerdown',e=>{stMouse=e.pointerType==='mouse';});
document.addEventListener('pointerup',()=>{if(stMouse){stMouse=false;setTimeout(sortSelect);}});
document.addEventListener('selectionchange',()=>{clearTimeout(sortSelect.t);if(!stMouse&&WD.f==='sort') sortSelect.t=setTimeout(sortSelect,600);});

/* ================= settings, backup ================= */
function setErr(m){const e=$('#setErr');e.textContent=m;e.classList.remove('hidden');}
function openSettings(){
  const cloud=!!(DB&&DB.kind==='cloud'),u=cloud&&fb&&fb.auth.currentUser;
  $('#acct').textContent=cloud?`Signed in as ${(u&&u.email)||'your Google account'}`:'On this device only';
  $('#acctLocal').classList.toggle('hidden',cloud);
  $('#signOut').classList.toggle('hidden',!cloud);$('#signIn').classList.toggle('hidden',cloud||!fb);
  $('#sWorker').value=SETTINGS.workerUrl||'';$('#sWorker').placeholder=WORKER_URL||'https://own-shelf-fetch.example.workers.dev';$('#sWorker').disabled=!cloud;
  $('#sMeanings').innerHTML=BY_MEANING.map(c=>`<label class="cm"><i style="background:var(--${c}S)" title="${COLORNAME(c)}"></i><input class="f" data-c="${c}" value="${esc(meaning(c))}" placeholder="${esc(MEANINGS[c])}" maxlength="40" autocomplete="off" aria-label="What ${COLORNAME(c)} highlights mean"></label>`).join('');
  $('#trashN').textContent='Trash';DB.all('trash:').then(l=>{$('#trashN').textContent=trashLabel(l.length);},()=>{});
  $('#setErr').classList.add('hidden');openModal('#setM');
}
$('#setBtn').onclick=openSettings;
$('#sSave').onclick=async()=>{
  const v=$('#sWorker').value.trim();
  if(v&&!/^(https:\/\/[^\s/]+|http:\/\/localhost[:/])/i.test(v)){setErr('The helper URL should start with https://');return;}
  // colour meanings: only the renamed ones are kept; a blank field goes back to the default
  const mn={};document.querySelectorAll('#sMeanings [data-c]').forEach(i=>{const c=i.dataset.c,m=i.value.trim().replace(/\s+/g,' ');if(m&&m!==MEANINGS[c]) mn[c]=m;});
  const old=SETTINGS.meanings||{},renamed=BY_MEANING.some(c=>(mn[c]||'')!==(old[c]||''));
  if(DB&&(v!==(SETTINGS.workerUrl||'')||renamed)){SETTINGS={...SETTINGS,workerUrl:v,meanings:mn};await DB.put('settings:app',SETTINGS);toast('Settings saved');}
  closeModal('#setM');
};
$('#backupBtn').onclick=async e=>{
  const b=e.currentTarget,label=b.textContent;b.disabled=true;b.textContent='Backing up…';
  try{
    await DB.flush();const data=await exportShelf(DB,META,shelves());
    download(`own-shelf-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data),'application/json');
    toast(`Backed up ${data.books.length} book${data.books.length===1?'':'s'}`);
  }catch(err){console.error(err);setErr('The backup failed. Try again.');}
  finally{b.disabled=false;b.textContent=label;}
};
$('#restoreBtn').onclick=()=>$('#restoreFile').click();
$('#restoreFile').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f) return;
  $('#setErr').classList.add('hidden');
  let data;try{data=JSON.parse(await f.text());}catch(err){setErr('That file isn’t an own-shelf backup.');return;}
  try{
    const r=await importShelf(DB,data,META,metaFor,shelves());if(r.shelves) SETTINGS={...SETTINGS,shelves:r.shelves};
    r.metas.forEach(m=>{META=META.filter(x=>x.id!==m.id).concat(m);untrashBook(m.id);});
    closeModal('#setM');renderShelf();
    toast(r.added||r.merged?`Restored ${r.added} book${r.added===1?'':'s'}${r.highlights?` and ${r.highlights} highlight${r.highlights===1?'':'s'}`:''}`:'Everything in that backup is already here');
  }catch(err){
    console.error(err);
    setErr(err.message==='not_backup'?'That file isn’t an own-shelf backup.':err.message==='newer_version'?'That backup comes from a newer version of own-shelf.':'The restore stopped partway. Run it again; books already restored are skipped.');
  }
};

/* ================= trash ================= */
// Removed books, highlights and notes wait 30 days under "trash:<id>", then go for good. Entries:
//   {id, kind:'book', deletedAt, bookId, title, meta, hl, notes}       only meta: was deleted; doc: and state: stay
//   {id, kind:'highlights', deletedAt, bookId, title, items, quote}    items: the full highlight objects
//   {id, kind:'note', deletedAt, bookId, title, hlId, text, quote, color}
//   {id, kind:'word', deletedAt, title, word}                         word: the whole word (title is its term), or a
//                                                                     fact card (title is its book's)
// Backups (exportShelf) cover the shelf only, so trashed books aren't in them.
const TRASH_DAYS=30,DAY=864e5;
let TRASH=[]; // the open Trash dialog's entries, newest first
// a highlight's text in about 140 characters, its blocks joined as in the plain-text export
const quoteOf=h=>{const s=segText(h).replace(/\n\n/g,' … ').replace(/\s+/g,' ').trim();return s.length>140?s.slice(0,140).replace(/\s+\S*$/,'')+'…':s;};
function toTrash(kind,o){
  const e=JSON.parse(JSON.stringify(Object.assign({id:kind[0]+Date.now().toString(36)+Math.random().toString(36).slice(2,6),kind,deletedAt:Date.now()},o)));
  DB.put('trash:'+e.id,e);return e;
}
// highlights removed from the open book; the quote is the first one in reading order
function trashHighlights(items){return toTrash('highlights',{bookId:DOC.id,title:DOC.title,items,quote:quoteOf(sorted(items)[0])});}
// After a delete: "Moved to Trash · Undo". Undo restores just that entry, as the Trash's Restore does. Another toast
// (the next delete, say) takes the button away; the entry stays in the Trash.
function movedToTrash(e){toast('Moved to Trash',{label:'Undo',run:async()=>{const why=await restoreEntry(e);if(why){toast(why);return;}afterRestore(e);toast('Restored');}});}
// Shows what came back where it's on screen; restoreEntry itself redraws the open book.
function afterRestore(e){
  const nb=!$('#notebook').classList.contains('hidden'),words=prefs.nbTab==='wd';
  if(onShelf()) renderShelf();
  else if(nb&&words&&e.kind==='word') renderWords();
  else if(nb&&!words&&e.kind!=='word') openNotebook(); // the Highlights tab reads the books again
}
// Puts an entry back. Returns '' or why it can't.
async function restoreEntry(e){
  if(e.kind==='word'){await restoreWord(e.word);DB.del('trash:'+e.id);return '';}
  const id=e.bookId,open=!!(DOC&&DOC.id===id);
  const doc=open?DOC:await DB.get('doc:'+id);
  if(!doc) return 'Can’t restore: the book was deleted for good.';
  if(e.kind==='book'){
    if(!META.some(m=>m.id===id)){const m=metaFor(doc,(await DB.get('state:'+id))||{});META.push(m);DB.put('meta:'+id,m);}
  } else {
    // a book that is itself in the Trash still gets these back in its state
    const st=open?ST:(await DB.get('state:'+id))||{hl:[],pos:0,maxP:0,done:[]};
    const hl=open?HL:(st.hl=st.hl||[]);let pids;
    if(e.kind==='highlights'){const have=new Set(hl.map(h=>h.id)),add=e.items.filter(h=>!have.has(h.id));hl.push(...add);pids=add.flatMap(h=>h.segs.map(s=>s.pid));}
    else{
      const h=hl.find(x=>x.id===e.hlId);
      if(!h) return 'Can’t restore: that highlight is gone. If it’s in the Trash, restore it first.';
      h.note=h.note?h.note+'\n'+e.text:e.text;pids=h.segs.map(s=>s.pid);
    }
    if(open){commit();rerender(pids);}
    else{
      DB.put('state:'+id,st);
      if(META.some(m=>m.id===id)){const m=metaFor(doc,st);META=META.filter(x=>x.id!==id).concat(m);DB.put('meta:'+id,m);}
    }
  }
  DB.del('trash:'+e.id);return '';
}
// a book back on the shelf (added again, or restored from a backup) leaves the Trash
function untrashBook(id){DB.all('trash:').then(l=>l.forEach(e=>{if(e.kind==='book'&&e.bookId===id)DB.del('trash:'+e.id);})).catch(()=>{});}
// Deletes an entry for good; a book takes its content along, unless it's back on the shelf (added again, or restored elsewhere).
function forget(e,db=DB){
  db.del('trash:'+e.id);
  if(e.kind==='book'&&!META.some(m=>m.id===e.bookId)){db.del('doc:'+e.bookId);db.del('state:'+e.bookId);}
}
// once per start, quietly
async function purgeTrash(){
  const db=DB,cut=Date.now()-TRASH_DAYS*DAY;
  try{(await db.all('trash:')).filter(e=>e.deletedAt<cut).forEach(e=>forget(e,db));}catch(err){console.warn('Trash purge',err);}
}
const trashLabel=n=>n?`Trash · ${n} item${n===1?'':'s'}`:'Trash is empty';
function ago(ms){const m=Math.floor(ms/6e4),h=Math.floor(m/60),d=Math.floor(h/24);return m<1?'just now':m<60?`${m} min ago`:h<24?`${h} hour${h===1?'':'s'} ago`:d===1?'yesterday':`${d} days ago`;}
function trashRow(e){
  const now=Date.now(),left=Math.max(1,Math.ceil((e.deletedAt+TRASH_DAYS*DAY-now)/DAY));
  let what,stripe,body;
  if(e.kind==='book'){
    const m=e.meta||{id:e.bookId};what='Book';stripe=coverOf(m)[0];
    body=`<p class="tr-meta">${esc([m.author,e.hl?lossText(e.hl,e.notes):'No highlights'].filter(Boolean).join(' · '))}</p>`;
  } else if(e.kind==='highlights'){
    const n=e.items.length;what=n===1?'Highlight':`${n} highlights`;stripe=`var(--${esc(e.items[0].color)}S)`;
    body=`<p class="q">${esc(e.quote)}</p>`;
  } else if(e.kind==='word'&&isFact(e.word)){
    what='Fact';stripe='var(--coralS)';body=`<p class="q">${esc(e.word.text||'')}</p>`;
  } else if(e.kind==='word'){
    const w=e.word||{},x=(w.examples||[])[0];what='Word';stripe='var(--sea)';
    body=`<p class="q">${w.def?esc(w.def):x?exampleHTML(x):''}</p>`;
  } else {what='Note';stripe=`var(--${esc(e.color||'sun')}S)`;body=`<p class="q">${esc(e.quote)}</p><div class="nt">${esc(e.text)}</div>`;}
  return `<div class="hcard tr-row" style="border-left-color:${stripe}" data-id="${esc(e.id)}"><div class="sec"><b>${what}</b> · ${esc(e.title)}</div>${body}
    <div class="tr-foot"><span class="tr-when">deleted ${ago(now-e.deletedAt)} · ${left} day${left===1?'':'s'} left</span><span class="tr-acts"><button class="btn danger" data-a="forget">Delete forever</button><button class="btn ghost" data-a="restore">Restore</button></span></div></div>`;
}
function renderTrash(){
  $('#trashList').innerHTML=TRASH.length?TRASH.map(trashRow).join(''):'<div class="empty">The Trash is empty.</div>';
  $('#trashEmpty').classList.toggle('hidden',!TRASH.length);
}
async function openTrash(){
  closeModal('#setM');TRASH=[];$('#trashList').innerHTML='<div class="empty">Opening the Trash…</div>';$('#trashEmpty').classList.add('hidden');openModal('#trashM');
  TRASH=(await DB.all('trash:')).sort((a,b)=>b.deletedAt-a.deletedAt);renderTrash();
}
$('#trashBtn').onclick=openTrash;
$('#trashList').onclick=async ev=>{
  const b=ev.target.closest('[data-a]'),row=b&&b.closest('[data-id]'),e=row&&TRASH.find(x=>x.id===row.dataset.id);if(!e)return;
  if(b.dataset.a==='forget'){if(!armed(b,'Tap again to delete'))return;forget(e);toast('Deleted for good');}
  else{b.disabled=true;const why=await restoreEntry(e);if(why){b.disabled=false;toast(why);return;}toast('Restored');afterRestore(e);}
  TRASH=TRASH.filter(x=>x!==e);renderTrash();
};
$('#trashEmpty').onclick=async()=>{
  const n=TRASH.length;if(!n)return;
  if(!await confirmTyped('Empty the Trash?',`This deletes ${n} item${n===1?'':'s'} for good. They can’t be restored.`,'Empty Trash'))return;
  TRASH.forEach(e=>forget(e));TRASH=[];renderTrash();toast('Trash emptied');
};

/* ================= study ================= */
// Flashcards for the saved words (word:<id>, see vocab.js). Opening builds the session's queue: every due word,
// most overdue first, then new words (no srs yet), oldest first, at most STUDY_NEW a day; a new word counts toward
// the day once rated (ls 'studyNew'). "Again" brings the card back STUDY_AGAIN cards later. Two kinds of card
// (prefs.studyMode): 'word' shows the word and asks for its meaning; 'cloze' shows a sentence with the word blanked
// out and the meaning as a hint, and asks for the word. srs.seen counts reviews; each one starts the examples one
// further along, so the front sentence changes. Fact cards (vocab.js) share the queue, the schedule and the day's new
// allowance; the card type doesn't apply to them.
const STUDY_NEW=20,STUDY_AGAIN=5,RATINGS=['again','good','easy'];
let SY={words:[],queue:[],i:0,shown:false,done:new Set()},syRun=0;
const syDay=()=>{const d=new Date();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;};
const syNewToday=()=>{const c=ls.get('studyNew',null);return c&&c.day===syDay()?c.n:0;};
const syMidnight=(t,days=0)=>{const d=new Date(t);d.setHours(24*days,0,0,0);return d.getTime();}; // local, so DST-safe
// when the next card is due: "in 5 min", "later today", "tomorrow", "in 3 days"
function syWhen(t,now){
  if(t<=now) return 'now';
  if(t-now<36e5) return `in ${Math.max(1,Math.round((t-now)/6e4))} min`;
  const days=Math.round((syMidnight(t)-syMidnight(now))/DAY);
  return days<1?'later today':days===1?'tomorrow':days<45?`in ${days} days`:`in ${Math.round(days/30)} months`;
}
// the examples in rotation order: the front shows the first, the back up to two more
function syExamples(w){const xs=(w.examples||[]).filter(x=>x&&x.text),k=xs.length?((w.srs&&w.srs.seen)||0)%xs.length:0;return xs.slice(k).concat(xs.slice(0,k));}
const syHasWord=x=>Number.isInteger(x.s)&&Number.isInteger(x.e)&&x.s>=0&&x.s<x.e&&x.e<=x.text.length;
// the sentence with the word in bold, or blanked out by cloze()
function sySentence(x,blank){
  if(!syHasWord(x)) return esc(x.text);
  if(!blank) return esc(x.text.slice(0,x.s))+'<b>'+esc(x.text.slice(x.s,x.e))+'</b>'+esc(x.text.slice(x.e));
  const c=cloze(x),gap=c.length-x.text.length+x.e-x.s;
  return esc(c.slice(0,x.s))+`<span class="sy-gap" aria-label="blank">${esc(c.slice(x.s,x.s+gap))}</span>`+esc(c.slice(x.s+gap));
}
async function openStudy(){
  const run=++syRun;SY={words:[],queue:[],i:0,shown:false,done:new Set()};
  show('study');window.scrollTo(0,0);syHead(false);
  $('#syCard').innerHTML='<div class="empty">Gathering your words…</div>';$('#syActs').innerHTML='';
  let words=[];try{words=await DB.all('word:');}catch(e){console.warn('Study',e);}
  if(run!==syRun) return;
  const now=Date.now();
  const due=words.filter(w=>w.srs&&isDue(w.srs,now)).sort((a,b)=>(a.srs.due||0)-(b.srs.due||0));
  const fresh=words.filter(w=>!w.srs).sort((a,b)=>(a.added||0)-(b.added||0)).slice(0,Math.max(0,STUDY_NEW-syNewToday()));
  SY.words=words;SY.queue=[...due,...fresh];syRender();
}
function syHead(on){
  $('#syProg').textContent=on?`${SY.i+1} of ${SY.queue.length}`:'';
  $('#syMode').classList.toggle('hidden',!on);
  const m=prefs.studyMode==='cloze'?'cloze':'word';
  document.querySelectorAll('#syMode button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m));
}
// no words at all, or the session is over
function syEnd(title,body){
  syHead(false);
  $('#syCard').innerHTML=`<div class="sy-end"><span class="sy-orn" aria-hidden="true">❦</span><h2>${title}</h2>${body}</div>`;
  $('#syActs').innerHTML='<button class="btn sea sy-big" data-sy="back">Back to shelf</button>';
}
function syRender(){
  const w=SY.queue[SY.i],now=Date.now();
  if(!SY.words.length) return syEnd('No words yet','<p>Select a word while reading and tap <b>Word</b>. It’s saved here with its sentence, ready to study.</p>');
  if(!w){
    // new words left over wait for tomorrow's allowance
    const next=SY.words.reduce((m,x)=>Math.min(m,x.srs?x.srs.due||0:syMidnight(now,1)),Infinity);
    const done=SY.words.filter(x=>SY.done.has(x.id)),nf=done.filter(isFact).length,nw=done.length-nf;
    return syEnd('All caught up',`<p>${done.length?`You reviewed ${[nw&&plural(nw,'word'),nf&&plural(nf,'fact')].filter(Boolean).join(' and ')}.`:'Nothing is due right now.'}</p><p class="sy-next">Next review ${syWhen(next,now)}.</p>`);
  }
  syHead(true);
  if(isFact(w)) return syFact(w,now);
  // a cloze needs a sentence that holds the word; without one the card shows the word
  const xs=syExamples(w),x=xs[0],cl=prefs.studyMode==='cloze'&&!!x&&syHasWord(x),open=SY.shown;
  const term=`<h2 class="sy-term">${esc(w.term)}</h2>${w.pos?`<p class="sy-pos">${esc(w.pos)}</p>`:''}`;
  const sent=x?`<p class="sy-sent">${sySentence(x,cl&&!open)}</p>`:'';
  const more=xs.slice(1,3).map(y=>`<li><p class="sy-sent">${sySentence(y)}</p>${y.title?`<p class="sy-from">${esc(y.title)}</p>`:''}</li>`).join('');
  const lines=w.def&&w.def.includes('\n')?' lines':''; // a meaning with line breaks reads left-aligned
  const front=cl?`<p class="sy-ask">Which word fits?</p>${sent}${w.def?`<p class="sy-hint${lines}"><span>Meaning</span>${esc(w.def)}</p>`:''}`:term+sent;
  const back=(cl?term:w.def?`<p class="sy-def${lines}">${esc(w.def)}</p>`:'<p class="sy-def none">No meaning saved yet</p>')+syNyms(w)+syPic(w)+(more?`<ul class="sy-more">${more}</ul>`:'');
  syCard(w,now,front,back,cl?'Show word':'Show meaning');
}
// a word's synonyms and antonyms, and a card's first picture, for the back
const syNyms=w=>['syn','ant'].map(k=>(w[k]||[]).length?`<p class="sy-nyms"><span>${XL[k]}</span>${esc(w[k].join(', '))}</p>`:'').join('');
const syPic=w=>{const p=(w.pics||[]).find(p=>p&&/^data:image\//.test(p.src||''));return p?`<img class="sy-pic" src="${esc(p.src)}" alt="">`:'';};
// A fact card. With a blank: the text with the phrase blanked out, and the back fills it in. Without: the text to
// recall, and the back gives the note and where it's from. A long text reads left-aligned. The back shows its picture.
function syFact(f,now){
  const c=factCloze(f),t=String(f.text||'');
  const text=c?esc(c.before)+(SY.shown?`<b class="sy-fill">${esc(c.phrase)}</b>`:'<span class="sy-gap" aria-label="blank">_____</span>')+esc(c.after):esc(t);
  const front=`<p class="sy-ask">${c?'What’s missing?':'Remember this?'}</p><p class="sy-sent sy-fact${t.length>160?' long':''}">${text}</p>`;
  const back=syPic(f)+(f.note?`<p class="sy-note">${esc(f.note)}</p>`:'')+`<p class="sy-book"><b>${esc(wordBook(f))}</b>${f.section?`<span>${esc(f.section)}</span>`:''}</p>`;
  syCard(f,now,front,back,c?'Show answer':f.note?'Show note':'Show source');
}
// the card, its back once shown, and the button that shows it or the three ratings
function syCard(w,now,front,back,show){
  const open=SY.shown;
  $('#syCard').innerHTML=`<article class="sy-card">${front}${open?`<div class="sy-back"><div class="sy-rule" aria-hidden="true">❦</div>${back}</div>`:''}</article>`;
  $('#syActs').innerHTML=open?`<div class="sy-rate">${RATINGS.map((r,i)=>`<button class="sy-r ${r}" data-r="${r}" aria-keyshortcuts="${i+1}"><b>${r[0].toUpperCase()+r.slice(1)}</b><small>${nextLabel(w.srs,r,now)}</small></button>`).join('')}</div>`
    :`<button class="btn sy-big" data-sy="show" aria-keyshortcuts="Space Enter">${show}</button>`;
}
function syShow(){if(SY.queue[SY.i]&&!SY.shown){SY.shown=true;syRender();}}
function syRate(r){
  const w=SY.queue[SY.i];if(!w||!SY.shown) return;
  if(!w.srs) ls.set('studyNew',{day:syDay(),n:syNewToday()+1});
  w.srs=Object.assign(schedule(w.srs,r,Date.now()),{seen:((w.srs&&w.srs.seen)||0)+1});
  DB.put('word:'+w.id,w);SY.done.add(w.id);
  const c=wordsDb===DB&&WORDS&&WORDS.get(w.id);if(c&&c!==w) c.srs=w.srs; // the cached copy, written again by a later lookup, keeps it
  if(r==='again') SY.queue.splice(Math.min(SY.queue.length,SY.i+1+STUDY_AGAIN),0,w);
  SY.i++;SY.shown=false;syRender();window.scrollTo(0,0);
}
$('#syBack').onclick=goShelf;
// a pointer click lets go of the focus, so Space goes back to the card instead of this button
$('#syMode').onclick=e=>{const b=e.target.closest('[data-m]');if(!b)return;if(e.detail)b.blur();prefs.studyMode=b.dataset.m;savePrefs();SY.shown=false;syRender();};
$('#syActs').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.r)syRate(b.dataset.r);else if(b.dataset.sy==='show')syShow();else if(b.dataset.sy==='back')goShelf();};
// Space or Enter shows the back (a focused button keeps its own Space and Enter); 1, 2, 3 rate
document.addEventListener('keydown',e=>{
  if($('#study').classList.contains('hidden')||!SY.queue[SY.i]||e.ctrlKey||e.metaKey||e.altKey||e.repeat) return;
  if(e.target.closest('input,textarea,select,[contenteditable]')) return;
  if((e.key===' '||e.key==='Enter')&&!SY.shown&&!e.target.closest('button,a')){e.preventDefault();syShow();}
  else if(/^[1-3]$/.test(e.key)&&SY.shown){e.preventDefault();syRate(RATINGS[e.key-1]);}
});

/* ================= accounts ================= */
const FIREBASE_VERSION='10.12.2';
const FB=`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-`;
let fb=null,unwatch=()=>{},incoming=null,siNote='';
// Google sign-in's helper pages live at https://<authDomain>/__/auth/ (config.js). Only when they're served
// from this site does a redirect sign-in come back signed in: Safari 16.1+, Firefox 109+ and Chrome 115+
// partition the storage of a third-party helper, such as Firebase's default upwind-reader.firebaseapp.com.
const authHere=firebaseConfig.authDomain.split('/')[0]===location.host;
// An iPhone or iPad home-screen app. Firebase can't use a popup there: it opens the helper with a plain
// link, so there's no window to report back to, and iOS loads it outside the app's own storage.
const homeScreen=()=>(/iPhone|iPad|iPod/.test(navigator.userAgent)||/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)&&(navigator.standalone===true||matchMedia('(display-mode: standalone)').matches);
const onShelf=()=>!$('#shelf').classList.contains('hidden');
// Errors a new copy of own-shelf hits while its Firebase project is being set up (README: Make your own shelf).
// Each names the project from config.js, so a fork that still has someone else's config can tell.
function setupError(e){
  const c=e&&e.code||'',p=`the Firebase project “${firebaseConfig.projectId}”`,host=location.hostname;
  if(c==='auth/unauthorized-domain') return `${host} isn’t an authorized domain of ${p}. Add it under Authentication → Settings → Authorized domains.`;
  if(c.startsWith('auth/requests-from-referer-')) return `The API key of ${p} doesn’t accept requests from ${host}. Add this site to the key’s website restrictions (Google Cloud console → Credentials).`;
  if(c.startsWith('auth/requests-to-this-api-')) return `The API key of ${p} blocks sign-in. Allow Identity Toolkit API and Token Service API in the key’s API restrictions.`;
  if(c==='auth/operation-not-allowed') return `Google sign-in is off in ${p}. Turn it on under Authentication → Sign-in method.`;
  if(c==='auth/configuration-not-found') return `Authentication isn’t set up in ${p}. Open Authentication and click Get started.`;
  if(c==='auth/invalid-api-key'||c.startsWith('auth/api-key-not-valid')) return `The apiKey in config.js isn’t a valid key for ${p}.`;
  if(/database \S+ does not exist|Cloud Firestore API has not been used/.test(e&&e.message||'')) return `${p} has no Firestore database yet. Create one under Firestore Database.`;
  return '';
}
function syncError(e){console.error(e);toast(setupError(e)||(e&&e.code==='permission-denied'?'Sync was refused. Check the Firestore rules.':'Couldn’t sync a change'+(e&&e.code?` (${e.code})`:'')));}
async function loadFirebase(){
  const [app,A,F]=await Promise.all(['app','auth','firestore'].map(m=>import(FB+m+'.js')));
  const fa=app.initializeApp(firebaseConfig);
  let db;try{db=F.initializeFirestore(fa,{localCache:F.persistentLocalCache({tabManager:F.persistentMultipleTabManager()})});}catch(e){db=F.getFirestore(fa);}
  return {A,F,auth:A.getAuth(fa),db};
}
async function start(store){
  unwatch();if(DB) await DB.flush();
  DB=store;await DB.open();DOC=null;ST=null;HL=[];
  // first shelf: wait briefly for the server when the offline cache is empty (a new device)
  META=await new Promise(res=>{let first=true,t=null;
    const settle=l=>{if(first){first=false;clearTimeout(t);res(l);}};
    unwatch=DB.watchMeta((list,fromCache)=>{
      if(first){if(fromCache&&!list.length&&!t){t=setTimeout(()=>settle(list),3000);return;}settle(list);return;}
      META=list;if(onShelf())renderShelf();
    },e=>{syncError(e);settle([]);});
  });
  SETTINGS=(await DB.get('settings:app'))||{};
  purgeTrash();
  const last=ls.get('last',null);
  if(incoming){show('shelf');renderShelf();runIncoming();}
  else if(last&&META.find(m=>m.id===last)) openBook(last); else {show('shelf');renderShelf();}
}
const startLocal=()=>start(makeLocal({onError:()=>toast('Storage is full — some changes may not be saved')}));
function startCloud(user){
  if(DB&&DB.kind==='cloud'&&DB.uid===user.uid) return;
  ls.set('mode',null);siNote='';
  start(makeCloud(fb.F,fb.db,user.uid,{onError:syncError}));
}
const siErr=m=>{$('#siErr').textContent=m||'';$('#siErr').classList.toggle('hidden',!m);};
function showSignin(msg){
  unwatch();unwatch=()=>{};DB=null;META=[];DOC=null;ST=null;HL=[];SETTINGS={};
  document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
  show('signin');document.title='own-shelf';
  $('#siGoogle').classList.toggle('hidden',!fb);
  siErr(msg||siNote);siNote='';
}
function authMessage(e){
  const c=e&&e.code||'';
  const safari=`Open ${location.host}${location.pathname.replace(/index\.html$/,'')} in Safari and sign in there, or use own-shelf on this device only.`;
  const setup=setupError(e);if(setup) return setup;
  if(c==='auth/network-request-failed') return 'No connection. Try again when you’re online.';
  if(c==='own/home-screen') return 'Google sign-in doesn’t work in the home-screen app yet. '+safari;
  // any other failure there, such as a return without an account: Firebase's helper shows errors like
  // "missing initial state" on its own page, so the app only sees the user come back signed out
  if(homeScreen()) return 'Google sign-in didn’t finish in the home-screen app'+(c.startsWith('auth/')?` (${c})`:'')+'. '+safari;
  if(c==='auth/popup-blocked') return 'The sign-in window was blocked. Allow pop-ups for this site, then try again.';
  if(c==='own/no-result') return 'Google sign-in didn’t finish. Try again.';
  return 'Sign-in didn’t work'+(c?` (${c})`:'')+'.';
}
// On the sign-in screen, now or once boot opens it; otherwise in Settings, where the other sign-in button is.
function authError(e){
  console.warn('Sign-in:',e);
  const m=authMessage(e);
  if(!$('#signin').classList.contains('hidden')) siErr(m);
  else if(DB){openSettings();setErr(m);}
  else siNote=m;
}
async function signIn(){
  if(!fb){toast('Sign-in isn’t available right now. Check your connection and reload.');return;}
  siErr('');
  const p=new fb.A.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'}); // always let Google ask which account
  if(homeScreen()) return authHere?redirectSignIn(p):authError({code:'own/home-screen'});
  try{await fb.A.signInWithPopup(fb.auth,p);}
  catch(e){
    if(e.code==='auth/popup-blocked'&&authHere) return redirectSignIn(p); // elsewhere a redirect comes back signed out
    if(e.code!=='auth/popup-closed-by-user'&&e.code!=='auth/cancelled-popup-request') authError(e);
  }
}
// Leaves the page. The time it left lets boot report a return without an account, once, instead of
// showing a plain sign-in screen that invites the same redirect again.
async function redirectSignIn(p){
  ls.set('redirectAt',Date.now());
  try{await fb.A.signInWithRedirect(fb.auth,p);}catch(e){ls.set('redirectAt',null);authError(e);}
}
async function signOut(){
  if(DOC){ST.pos=scrollY;await saveState(true);}
  if(DB) await DB.flush();
  closeModal('#setM');
  await fb.A.signOut(fb.auth); // onAuthStateChanged shows the sign-in screen
}
$('#siGoogle').onclick=signIn;
$('#siLocal').onclick=()=>{ls.set('mode','local');startLocal();};
$('#signIn').onclick=()=>{closeModal('#setM');signIn();};
$('#signOut').onclick=signOut;

/* ================= deep links: ?add=, ?url=, ?text= (iOS Shortcut, Android share), ?study=1 ================= */
function readDeepLink(){
  const raw=new URLSearchParams(location.search);const v=raw.get('add')||raw.get('url')||raw.get('text')||'';
  if(!v.trim()){if(raw.has('study'))incoming={study:true};return;}
  const url=firstUrl(v);incoming=url?{url}:{text:v};
}
async function runIncoming(){
  const x=incoming;incoming=null;if(!x) return;
  const q=new URLSearchParams(location.search);['add','url','text','title','study'].forEach(k=>q.delete(k));
  history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);
  if(x.study){openStudy();return;}
  openImport();
  if(x.url){$('#link').value=x.url;if(await importLink(x.url)) $('#impGo').click();}
  else await insertClip('',x.text,[]);
}

/* ================= keep changes when the tab is hidden or closed ================= */
function persist(){(async()=>{if(DOC&&ST){ST.pos=scrollY;await saveState(true);}if(DB) await DB.flush();})();}
addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden') persist();});

/* ================= boot ================= */
(async function(){
  readDeepLink();
  if('serviceWorker' in navigator&&isSecureContext) navigator.serviceWorker.register('sw.js').catch(()=>{});
  const local=ls.get('mode',null)==='local';
  if(local) startLocal();
  let fbErr=null;
  try{fb=await loadFirebase();}catch(e){console.warn('Firebase did not load',e);fb=null;fbErr=e;}
  if(!fb){if(!local) showSignin(setupError(fbErr)||'Sign-in isn’t available right now (offline?). You can still use own-shelf on this device only.');return;}
  const left=ls.get('redirectAt',0);ls.set('redirectAt',null); // a redirect sign-in this app started
  fb.A.getRedirectResult(fb.auth).then(r=>{if(!r&&Date.now()-left<6e5&&!fb.auth.currentUser) authError({code:'own/no-result'});},authError);
  fb.A.onAuthStateChanged(fb.auth,user=>{
    if(user) startCloud(user);
    else if(ls.get('mode',null)==='local'){if(!DB||DB.kind!=='local') startLocal();}
    else showSignin();
  });
})();
