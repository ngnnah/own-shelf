// own-shelf app (formerly Upwind). Ported from legacy/app-script.js; all data goes through the store.js adapters.
import {makeLocal,makeCloud,exportShelf,importShelf} from './store.js';
import {firebaseConfig,FIREBASE_VERSION,WORKER_URL} from './config.js';
/* ================= utils ================= */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('on'),2100);}
const COLORS=[['sun','Sunny'],['mint','Mint'],['coral','Coral'],['sky','Sky']];
// cloth bindings: [cover, text]. Books store an index into this list; changing its length recolours them.
const COVERS=[['#2F5A43','#F3EAD7'],['#8E2F2A','#F8EEDD'],['#23395B','#EFE4CC'],['#B7802A','#2E2119'],['#5C3B24','#F3EAD7'],['#45706C','#F8EEDD'],['#D9C9A8','#2E2119'],['#6B3426','#F3D9B0']];
const cover=id=>{const m=META.find(x=>x.id===id);return COVERS[m&&m.color!=null?m.color%COVERS.length:parseInt(hash(id),36)%COVERS.length];};
const fmtMonth=ms=>new Date(ms).toLocaleDateString(undefined,{month:'long',year:'numeric'});
const fmtDay=ms=>new Date(ms).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
const ls={get(k,d){try{const v=localStorage.getItem('upwind:'+k);return v?JSON.parse(v):d;}catch(e){return d;}},set(k,v){try{localStorage.setItem('upwind:'+k,JSON.stringify(v));}catch(e){}}};

/* ================= storage (a store.js adapter, chosen at sign-in) ================= */
let DB=null;
let SETTINGS={}; // settings:app, e.g. {workerUrl}
let META=[];           // shelf entries
let DOC=null, ST=null; // open document + its reading state
let HL=[];
let prefs=Object.assign({size:1,theme:'auto',fmt:'md',group:'added',view:'shelves',sort:'added',dir:-1},ls.get('prefs',{}));
const SIZES=['1.08rem','1.22rem','1.38rem'];
function savePrefs(){ls.set('prefs',prefs);}
function applyPrefs(){
  document.documentElement.style.setProperty('--fs',SIZES[prefs.size]);
  if(prefs.theme==='auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme',prefs.theme);
  document.querySelectorAll('#segFmt button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.fmt===prefs.fmt));
  document.querySelectorAll('#segGroup button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.g===prefs.group));
  document.querySelectorAll('#segView button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===prefs.view));
}
applyPrefs();
function metaFor(doc,st){
  return {id:doc.id,title:doc.title,author:doc.author||'',written:doc.written||'',writtenSort:doc.writtenSort||'',source:doc.source||'',added:doc.added,
    color:doc.color,words:doc.words,secs:doc.sections.length,opened:st.opened||0,progress:st.finished?1:Math.min(1,st.maxP||0),finished:!!st.finished,hl:(st.hl||[]).length};
}
async function saveMeta(){ if(!DOC) return; const m=metaFor(DOC,ST); META=META.filter(x=>x.id!==m.id).concat(m); await DB.put('meta:'+m.id,m); }
let stT;function saveState(now){clearTimeout(stT);const f=async()=>{if(!DOC)return;ST.hl=HL;await DB.put('state:'+DOC.id,ST);await saveMeta();};if(now) return f(); stT=setTimeout(f,500);}

/* ================= views ================= */
function show(view){
  $('#signin').classList.toggle('hidden',view!=='signin');
  $('#shelf').classList.toggle('hidden',view!=='shelf');
  $('#notebook').classList.toggle('hidden',view!=='notebook');
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
function groupKey(m){
  if(prefs.group==='added') return {k:new Date(m.added).getFullYear()*100+new Date(m.added).getMonth(),label:fmtMonth(m.added)};
  if(prefs.group==='written') return m.writtenSort?{k:+m.writtenSort.slice(0,4),label:m.writtenSort.slice(0,4)}:{k:-1,label:'Undated'};
  return m.author?{k:m.author.toLowerCase(),label:m.author}:{k:'￿',label:'Unknown author'};
}
function filtered(){const q=$('#q').value.trim().toLowerCase();return META.filter(m=>!q||(m.title+' '+m.author).toLowerCase().includes(q));}
// A text's length, compact: "40 words", "4.2k words", "200k words". '' when unknown (older shelf entries have no count).
const fmtWords=w=>!(w>0)?'':w<1000?`${w} word${w===1?'':'s'}`:`${w<9950?(w/1000).toFixed(1).replace(/\.0$/,''):Math.round(w/1000)}k words`;
// The page block's thickness in px, on a log scale: ~4 at 200 words, ~30 at 150k, clamped to 3–32. Unknown → 3.
const pagesPx=w=>w>0?Math.round(Math.min(32,Math.max(3,9.04*Math.log10(w)-16.8))):3;
function bookHTML(m){
  const [bc,bt]=cover(m.id), h=186+parseInt(hash(m.id+'h'),36)%34;
  const pct=Math.round(m.progress*100), yr=m.writtenSort?m.writtenSort.slice(0,4):'', len=fmtWords(m.words);
  return `<div class="book" style="--pg:${pagesPx(m.words)}px">${m.finished?'<span class="ribbon" title="Finished"></span>':''}
    <button class="cover" data-open="${m.id}" style="--bc:${bc};--bt:${bt};--h:${h}px" aria-label="${esc(m.title)}${m.author?' by '+esc(m.author):''}${len?`, ${m.words.toLocaleString()} word${m.words===1?'':'s'}`:''}, ${m.finished?'finished':pct+'% read'}">
      <span class="c-t">${esc(m.title)}</span>${m.author?`<span class="c-a">${esc(m.author)}</span>`:''}${len?`<span class="c-l">${len}</span>`:''}
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
  $('#contWrap').innerHTML=cont?`<div class="cont"><span class="cv" style="background:${cover(cont.id)[0]}"></span><div class="ct"><small>Continue reading</small><b>${esc(cont.title)}</b><span>${Math.round(cont.progress*100)}% · about ${Math.max(1,Math.round(cont.words*(1-cont.progress)/230))} min left</span></div><button class="btn" data-open="${cont.id}">Continue</button></div>`:'';
  const body=$('#shelfBody');
  if(!all.length){
    body.innerHTML=`<div class="empty-shelf"><img src="icons/mark.svg" alt=""><h2>An empty shelf, for now.</h2><p>Add a PDF, a text file, or paste any article. It lands here as a book you can read, highlight and come back to.</p><button class="btn sea" data-add>Add your first text</button></div>`;
    return;
  }
  const list=filtered();
  if(!list.length){body.innerHTML=`<div class="empty">Nothing on the shelf matches “${esc($('#q').value)}”.</div>`;return;}
  if(prefs.view==='list'){
    const cols=[['title','Title'],['author','Author'],['written','Written'],['words','Length'],['added','Added'],['progress','Progress'],['hl','Highlights']];
    const val=(m,c)=>c==='written'?(m.writtenSort||''):c==='title'||c==='author'?(m[c]||'￿').toLowerCase():c==='words'?(m.words||0):m[c];
    const rows=[...list].sort((a,b)=>{const A=val(a,prefs.sort),B=val(b,prefs.sort);return (A<B?-1:A>B?1:0)*prefs.dir;});
    body.innerHTML=`<table class="tbl"><thead><tr>${cols.map(([c,l])=>`<th class="c-${c}"><button data-sort="${c}" aria-sort="${prefs.sort===c?(prefs.dir>0?'ascending':'descending'):'none'}">${l}${prefs.sort===c?(prefs.dir>0?' ↑':' ↓'):''}</button></th>`).join('')}</tr></thead><tbody>${
      rows.map(m=>`<tr data-open="${m.id}" tabindex="0"><td><span class="tt"><i style="background:${cover(m.id)[0]}"></i>${esc(m.title)}</span></td><td class="mut">${esc(m.author||'—')}</td><td class="mut">${esc(m.written||'—')}</td><td class="mut c-words">${fmtWords(m.words)||'—'}</td><td class="mut c-added">${fmtDay(m.added)}</td><td>${m.finished?'Finished':`<span class="pbar"><i style="width:${Math.round(m.progress*100)}%"></i></span>${Math.round(m.progress*100)}%`}</td><td class="mut c-hl">${m.hl}</td></tr>`).join('')}</tbody></table>`;
    return;
  }
  const groups=new Map();
  list.forEach(m=>{const g=groupKey(m);if(!groups.has(g.label))groups.set(g.label,{k:g.k,items:[]});groups.get(g.label).items.push(m);});
  const ord=[...groups.entries()].sort((a,b)=>{const A=a[1].k,B=b[1].k;if(prefs.group==='author') return A<B?-1:A>B?1:0; return B-A;});
  const inner=m=>prefs.group==='added'?-m.added:prefs.group==='written'?-(+(m.writtenSort||'0').replace(/-/g,'')):-(+(m.writtenSort||'0').replace(/-/g,''));
  body.innerHTML=ord.map(([label,g])=>`<section class="shelf-row"><h3 class="shelf-label">${esc(label)}<small>${g.items.length}</small></h3><div class="books">${g.items.sort((a,b)=>inner(a)-inner(b)).map(bookHTML).join('')}</div><div class="plank"></div></section>`).join('');
}
$('#shelf').addEventListener('click',e=>{
  const o=e.target.closest('[data-open]'); if(o){openBook(o.dataset.open);return;}
  const ed=e.target.closest('[data-edit]'); if(ed){openDetails(ed.dataset.edit);return;}
  if(e.target.closest('[data-add]')){openImport();return;}
  const s=e.target.closest('[data-sort]'); if(s){const c=s.dataset.sort;if(prefs.sort===c) prefs.dir*=-1; else {prefs.sort=c;prefs.dir=(c==='title'||c==='author')?1:-1;}savePrefs();renderShelf();}
});
$('#shelf').addEventListener('keydown',e=>{if(e.key==='Enter'){const r=e.target.closest('tr[data-open]');if(r) openBook(r.dataset.open);}});
$('#segGroup').onclick=e=>{const b=e.target.closest('button');if(!b)return;prefs.group=b.dataset.g;if(prefs.view==='list'){prefs.sort=prefs.group;prefs.dir=prefs.group==='author'?1:-1;}savePrefs();applyPrefs();renderShelf();};
$('#segView').onclick=e=>{const b=e.target.closest('button');if(!b)return;prefs.view=b.dataset.v;savePrefs();applyPrefs();renderShelf();};
$('#q').oninput=renderShelf;
$('#addBtn').onclick=()=>openImport();

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
$('#file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f) loadFile(f);};
const dz=$('#dz');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('over');}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('over');}));
dz.addEventListener('drop',e=>{e.stopPropagation();const f=e.dataTransfer.files[0];if(f) loadFile(f);});
function renderPending(){
  $('#dzHint').innerHTML=pending?`<span class="chipf">${esc(pending.name)}<button aria-label="Remove file" id="rmFile">✕</button></span>`:'PDF, .txt, .md or .html — or drop it here';
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
async function loadFile(f){
  $('#impErr').classList.add('hidden');$('#dzHint').textContent='Reading '+f.name+'…';
  try{
    let r;
    if(/\.pdf$/i.test(f.name)||f.type==='application/pdf') r=await pdfBlocks(f);
    else{const t=await f.text(); r={blocks:/\.html?$/i.test(f.name)||/^\s*</.test(t)?htmlToBlocks(t):mdToBlocks(t),hint:nameTitle(f.name),author:'',source:''};}
    pending=Object.assign({name:f.name},r);
  }catch(e){console.error(e);pending=null;impErr(/pdf\.js/.test(e.message)?"The PDF reader didn't load. Try again, or paste the text instead.":"Couldn't read any text from that file. If it's a scanned PDF, paste the text instead.");}
  renderPending();detect();
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
  const d=finalize(s.blocks,{title:s.title,hint:s.hint,author:s.author,written:s.written,source:s.source});
  const c={li:0,img:0,h:0};d.blocks.forEach(b=>{if(c[b.t]!==undefined)c[b.t]++;});
  det.innerHTML=`Found <b>${esc(d.title)}</b>${d.author?` by <b>${esc(d.author)}</b>`:''}${d.written?`, written <b>${esc(d.written)}</b>`:''} · ${d.words.toLocaleString()} words · ${d.sections.length} section${d.sections.length===1?'':'s'}${c.li?` · ${c.li} list items`:''}${c.img?` · ${c.img} image${c.img>1?'s':''}`:''}${d.notes.length?` · ${d.notes.length} notes`:''}`;
  $('#fTitle').placeholder=d.title;$('#fAuthor').placeholder=d.author||'Optional';$('#fWritten').placeholder=d.written||'e.g. July 2023';
}
$('#impGo').onclick=async()=>{
  const s=currentSource();
  if(!s){impErr('Choose a file or paste something first.');return;}
  const d=finalize(s.blocks,{title:$('#fTitle').value.trim()||s.title,hint:s.hint,author:$('#fAuthor').value.trim()||s.author,written:$('#fWritten').value.trim()||s.written,source:s.source});
  if(d.words<20&&!d.blocks.some(b=>b.t==='img')){impErr('That looks too short to read — paste the full text.');return;}
  await addDoc(d);closeModal('#importM');
};
async function addDoc(d){
  d.id=hash(JSON.stringify(d.blocks.map(b=>b.text||b.src)).slice(0,200000))+hash(d.title);
  const exists=META.find(m=>m.id===d.id);
  if(exists){toast('Already on your shelf — opening it');openBook(d.id);return;}
  d.added=Date.now();
  const used=META.slice().sort((a,b)=>b.added-a.added).slice(0,3).map(m=>m.color);let c=META.length%COVERS.length;while(used.includes(c))c=(c+1)%COVERS.length;d.color=c;
  const st={hl:[],pos:0,maxP:0,done:[],opened:Date.now()};
  await DB.put('doc:'+d.id,d);await DB.put('state:'+d.id,st);const m=metaFor(d,st);await DB.put('meta:'+d.id,m);META.push(m);
  openBook(d.id);
}
// drop anywhere
let dragDepth=0;
addEventListener('dragenter',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')&&$('#importM').classList.contains('hidden')){dragDepth++;$('#dropAll').classList.add('on');}});
addEventListener('dragleave',()=>{dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('#dropAll').classList.remove('on');});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#dropAll').classList.remove('on');const f=e.dataTransfer&&e.dataTransfer.files[0];if(f&&$('#importM').classList.contains('hidden')) openImport(f);});

/* ================= details ================= */
let detId=null;
async function openDetails(id){
  detId=id;const m=META.find(x=>x.id===id);if(!m)return;
  $('#dTitle').value=m.title;$('#dAuthor').value=m.author;$('#dWritten').value=m.written;$('#dSource').value=m.source;openModal('#detM');
}
$('#dSave').onclick=async()=>{
  const d=DOC&&DOC.id===detId?DOC:await DB.get('doc:'+detId);if(!d)return;
  d.title=$('#dTitle').value.trim()||d.title;d.author=$('#dAuthor').value.trim();d.written=$('#dWritten').value.trim();d.writtenSort=parseDate(d.written);
  const src=$('#dSource').value.trim();d.source=/^https?:\/\//i.test(src)?src:'';
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
// Deleting highlights or notes needs "yes" typed in a dialog; resolves true only then.
let cfDone=null;
const cfOk=()=>$('#cfInput').value.trim().toLowerCase()==='yes';
function confirmTyped(title,body,label){
  return new Promise(res=>{
    $('#cfH').textContent=title;$('#cfBody').textContent=body;$('#cfGo').textContent=label;$('#cfInput').value='';$('#cfGo').disabled=true;
    cfDone=v=>{cfDone=null;closeModal('#confirmM');res(v);};
    openModal('#confirmM');$('#cfInput').focus(); // synchronous, so iOS opens the keyboard when this runs from a tap
  });
}
$('#cfInput').addEventListener('input',()=>{$('#cfGo').disabled=!cfOk();});
$('#cfInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&cfOk()&&cfDone){e.preventDefault();cfDone(true);}});
$('#cfGo').onclick=()=>{if(cfOk()&&cfDone)cfDone(true);};
// Cancel, a tap outside or Escape all hide the dialog: that answers no
new MutationObserver(()=>{if($('#confirmM').classList.contains('hidden')&&cfDone)cfDone(false);}).observe($('#confirmM'),{attributes:true,attributeFilter:['class']});
const lossText=(n,nn)=>`${n} highlight${n===1?'':'s'}${nn?` and ${nn} note${nn===1?'':'s'}`:''}`;
const UNDO_NOTE="This can't be undone. To keep a copy, back up the shelf in Settings first.";
$('#dRemove').onclick=async e=>{
  const id=detId,m=META.find(x=>x.id===id);if(!m)return;
  if(m.hl){
    const hl=DOC&&DOC.id===id?HL:(((await DB.get('state:'+id))||{}).hl||[]);
    if(!await confirmTyped('Remove this book?',`This removes “${m.title}” and its ${lossText(hl.length||m.hl,hl.filter(h=>h.note).length)}. ${UNDO_NOTE}`,'Remove book'))return;
  } else if(!armed(e.currentTarget,'Tap again to remove'))return;
  await DB.del('doc:'+id);await DB.del('state:'+id);await DB.del('meta:'+id);META=META.filter(x=>x.id!==id);
  closeModal('#detM');toast('Removed from shelf');if(DOC&&DOC.id===id){DOC=null;goShelf();} else renderShelf();
};
$('#barTitle').onclick=()=>DOC&&openDetails(DOC.id);

/* ================= reader ================= */
let blockIndex={},order={},secOf={};
async function openBook(id,opts){
  $('#busy').classList.remove('hidden');
  const d=await DB.get('doc:'+id);
  if(!d){$('#busy').classList.add('hidden');toast("Couldn't find that text");return;}
  resetFind(id);
  DOC=d;ST=(await DB.get('state:'+id))||{hl:[],pos:0,maxP:0,done:[]};ST.done=ST.done||[];HL=ST.hl||[];ST.opened=Date.now();
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
  const c=[...cuts].sort((a,z)=>a-z);let out='';
  const fnAt=p=>fns.filter(f=>cl(f.at)===p).map(f=>`<button class="fn" data-n="${f.n}" aria-expanded="false" aria-label="Note ${f.n}">${f.n}</button>`).join('');
  for(let i=0;i<c.length-1;i++){
    const a=c[i],z=c[i+1];out+=fnAt(a);
    let s=esc(t.slice(a,z));const act=marks.filter(m=>m.s<=a&&m.e>=z);
    if(act.some(m=>m.k==='code')) s=`<code>${s}</code>`;
    if(act.some(m=>m.k==='i')) s=`<em>${s}</em>`;
    if(act.some(m=>m.k==='b')) s=`<strong>${s}</strong>`;
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
    <div class="howto">Select text to highlight in ${COLORS.map(c=>`<span class="sw" style="background:var(--${c[0]}S)" title="${c[1]}"></span>`).join('')} · keys 1–4 work too</div>
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
  col.querySelectorAll('.pull button').forEach(btn=>btn.onclick=()=>{const [pid,s,e]=btn.dataset.pq.split(':');addHighlight([{pid,s:+s,e:+e}],'sun');toast('Highlighted');});
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
let cpObs=null;
function observeCheckpoints(){
  if(cpObs) cpObs.disconnect();
  if(!('IntersectionObserver' in window)) return;
  cpObs=new IntersectionObserver(es=>es.forEach(en=>{
    if(!en.isIntersecting) return;
    const el=en.target;
    if(el.id==='land'){ if(!ST.finished){ST.finished=true;ST.maxP=1;saveState();} return; }
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
function addHighlight(segs,color,note){const h={id:'h'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),color,note:note||'',segs,at:Date.now()};HL.push(h);commit();rerender(segs.map(s=>s.pid));return h;}
function updateCount(){
  $('#hlCount').textContent=HL.length;const lm=$('#landMsg');if(!lm)return;const nn=HL.filter(h=>h.note).length;
  lm.textContent=HL.length?`You marked ${HL.length} highlight${HL.length>1?'s':''}${nn?` and wrote ${nn} note${nn>1?'s':''}`:''}. Take them with you.`:'You made it to the end. Select any passage above to highlight it, then copy everything from here.';
}
function showTool(rect,h){
  editing=h||null;
  tool.innerHTML=COLORS.map((c,i)=>`<button class="sw${h&&h.color===c[0]?' on':''}" style="background:var(--${c[0]}S)" data-c="${c[0]}" aria-label="${c[1]} (${i+1})"></button>`).join('')+
    `<span class="sep"></span><button class="tb" data-a="note">${h&&h.note?'Edit note':'Note'}</button>`+(h?`<button class="tb" data-a="del">Remove</button>`:`<button class="tb" data-a="copy">Copy</button>`);
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
  if(b.dataset.a==='del'&&editing){const pids=editing.segs.map(s=>s.pid);HL=HL.filter(x=>x!==editing);commit();rerender(pids);hideTool();toast('Highlight removed');return;}
  if(b.dataset.a==='copy'&&pendingSegs){copyText(pendingSegs.map(s=>blockIndex[s.pid].text.slice(s.s,s.e)).join('\n\n'),'Copied');return;}
  if(b.dataset.a==='note'){let h=editing;if(!h&&pendingSegs){h=addHighlight(pendingSegs,'sun');getSelection().removeAllRanges();}if(h)openNote(h,tool.getBoundingClientRect());hideTool();}
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
  if(/^[1-4]$/.test(e.key)&&pendingSegs&&!tool.classList.contains('hidden')){addHighlight(pendingSegs,COLORS[+e.key-1][0]);getSelection().removeAllRanges();hideTool();}
});
let noteTarget=null;
function openNote(h,rect){
  noteTarget=h;const nb=$('#noteBox');nb.classList.remove('hidden');$('#noteTa').value=h.note||'';const w=nb.offsetWidth;
  if(coarse||!rect){nb.style.left='50%';nb.style.transform='translateX(-50%)';nb.style.top='auto';nb.style.bottom='calc(env(safe-area-inset-bottom,0px) + 16px)';}
  else{nb.style.transform='none';nb.style.bottom='auto';nb.style.left=Math.max(10,Math.min(innerWidth-w-10,rect.left))+'px';nb.style.top=Math.min(innerHeight-220,Math.max(70,rect.top))+'px';}
  setTimeout(()=>$('#noteTa').focus(),30);
}
$('#noteCancel').onclick=()=>$('#noteBox').classList.add('hidden');
$('#noteSave').onclick=()=>{if(noteTarget){noteTarget.note=$('#noteTa').value.trim();commit();rerender(noteTarget.segs.map(s=>s.pid));toast(noteTarget.note?'Note saved':'Note cleared');}$('#noteBox').classList.add('hidden');};

/* highlights drawer & export */
let filter='all';
function sorted(){return [...HL].sort((a,b)=>{const A=a.segs[0],B=b.segs[0];return ((order[A.pid]??1e9)-(order[B.pid]??1e9))||(A.s-B.s);});}
const secName=h=>{const i=secOf[h.segs[0].pid];return i===-1?'Notes':i!=null&&DOC.sections[i]?`${i+1}. ${DOC.sections[i].title}`:'';};
function renderDrawer(){
  const counts={};HL.forEach(h=>counts[h.color]=(counts[h.color]||0)+1);const nn=HL.filter(h=>h.note).length;
  const keep=h=>filter==='all'||(filter==='noted'?h.note:h.color===filter);if(!HL.some(keep))filter='all';
  $('#drFilters').innerHTML=`<button class="chip" aria-pressed="${filter==='all'}" data-f="all">All ${HL.length}</button>`+(nn?`<button class="chip" aria-pressed="${filter==='noted'}" data-f="noted">With note ${nn}</button>`:'')+COLORS.filter(c=>counts[c[0]]).map(c=>`<button class="chip" aria-pressed="${filter===c[0]}" data-f="${c[0]}"><i style="background:var(--${c[0]}S)"></i>${c[1]} ${counts[c[0]]}</button>`).join('');
  $('#drFilters').querySelectorAll('.chip').forEach(b=>b.onclick=()=>{filter=b.dataset.f;renderDrawer();});
  const list=sorted().filter(keep);
  $('#drList').innerHTML=list.length?list.map(h=>`<div class="hcard" style="border-left-color:var(--${h.color}S)" data-id="${h.id}"><div class="sec">${esc(secName(h))}</div><p class="q" tabindex="0">${esc(segText(h)).replace(/\n\n/g,' <span style="color:var(--muted)">¶</span> ')}</p>${h.note?`<div class="nt">${esc(h.note)}</div>`:''}<div class="acts"><button data-a="note">${h.note?'Edit note':'Add note'}</button><button data-a="del">Remove</button></div></div>`).join('')
    :`<div class="empty">No highlights yet.<br>Select any passage and pick a color.</div>`;
  $('#drList').querySelectorAll('.hcard').forEach(card=>{
    const h=HL.find(x=>x.id===card.dataset.id);
    card.querySelector('.q').onclick=()=>jumpTo(h);card.querySelector('.q').onkeydown=e=>{if(e.key==='Enter')jumpTo(h);};
    card.querySelector('[data-a="note"]').onclick=()=>openNote(h,card.getBoundingClientRect());
    card.querySelector('[data-a="del"]').onclick=()=>{const pids=h.segs.map(s=>s.pid);HL=HL.filter(x=>x!==h);commit();rerender(pids);};
  });
}
function jumpTo(h){closeDrawers();const m=document.querySelector(`mark[data-h="${h.id}"]`);if(!m)return;m.scrollIntoView({block:'center'});document.querySelectorAll(`mark[data-h="${h.id}"]`).forEach(x=>{x.classList.remove('flash');void x.offsetWidth;x.classList.add('flash');});}
$('#segFmt').onclick=e=>{const b=e.target.closest('button');if(!b)return;prefs.fmt=b.dataset.fmt;savePrefs();applyPrefs();};
$('#clearAll').onclick=async()=>{
  if(!HL.length)return;
  if(!await confirmTyped('Clear all highlights?',`This deletes all ${lossText(HL.length,HL.filter(h=>h.note).length)} in “${DOC.title}”. ${UNDO_NOTE}`,'Clear all'))return;
  const pids=HL.flatMap(h=>h.segs.map(s=>s.pid));HL=[];commit();rerender(pids);toast('Highlights cleared');
};
function exportText(){
  const list=sorted();const cname=c=>(COLORS.find(x=>x[0]===c)||[c,c])[1];
  if(prefs.fmt==='md'){
    let o=`# Highlights: ${DOC.title}\n`+[DOC.author&&`by ${DOC.author}`,DOC.written,DOC.source].filter(Boolean).map(x=>`_${x}_`).join(' · ')+'\n\n';
    let lastSec=null;
    list.forEach(h=>{const s=secName(h);if(s&&s!==lastSec&&DOC.sections.length>1){o+=`## ${s}\n\n`;lastSec=s;}
      o+=segText(h).split('\n\n').map(p=>'> '+p).join('\n>\n')+'\n';if(h.note)o+=`\n**Note:** ${h.note}\n`;o+=`\n<sub>${cname(h.color)}</sub>\n\n`;});
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
let EX={scope:'book',fmt:prefs.exFmt||'md',notesOnly:false,items:[],text:''};
const COLORNAME=c=>(COLORS.find(x=>x[0]===c)||[c,c])[1];
const COLORHEX={sun:'#F4C21B',mint:'#2FBF8A',coral:'#F2668A',sky:'#4E8FF0'};
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
function renderExport(books,fmt){
  const multi=EX.scope==='shelf';
  const today=new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
  if(fmt==='md'){
    let o=multi?`# My reading notes\n_Exported ${today} · ${books.length} book${books.length===1?'':'s'}_\n\n`:'';
    books.forEach(b=>{
      const H=multi?'##':'#',S=multi?'###':'##';
      o+=`${H} ${b.doc.title}\n`;const ml=metaLine(b.doc);if(ml.length)o+=ml.map(x=>`_${x}_`).join(' · ')+'\n';o+='\n';
      let last=null;
      b.entries.forEach(e=>{if(e.section&&e.section!==last){o+=`${S} ${e.section}\n\n`;last=e.section;}
        o+=e.text.map(p=>'> '+p).join('\n>\n')+'\n';if(e.note)o+=`\n**Note:** ${e.note}\n`;o+='\n';});
    });
    return o.trim()+'\n';
  }
  if(fmt==='txt'){
    let o=multi?`MY READING NOTES\nExported ${today}\n\n`:'';
    books.forEach(b=>{
      o+=b.doc.title.toUpperCase()+'\n';const ml=metaLine(b.doc);if(ml.length)o+=ml.join(' · ')+'\n';o+='\n';
      let last=null,n=0;
      b.entries.forEach(e=>{if(e.section&&e.section!==last){o+=`— ${e.section}\n\n`;last=e.section;}
        o+=`${++n}. “${e.text.join(' … ')}”\n`;if(e.note)o+=`   Note: ${e.note}\n`;o+='\n';});
      o+='\n';
    });
    return o.trim()+'\n';
  }
  const title=multi?'My reading notes':'Notes: '+books[0].doc.title;
  let body='';
  books.forEach(b=>{
    body+=`<article><h${multi?2:1}>${esc(b.doc.title)}</h${multi?2:1}>`;const ml=metaLine(b.doc);
    if(ml.length) body+=`<p class="meta">${ml.map(x=>/^https?:/.test(x)?`<a href="${esc(x)}">${esc(x)}</a>`:esc(x)).join(' · ')}</p>`;
    let last=null;
    b.entries.forEach(e=>{if(e.section&&e.section!==last){body+=`<h${multi?3:2}>${esc(e.section)}</h${multi?3:2}>`;last=e.section;}
      body+=`<blockquote style="border-color:${COLORHEX[e.color]||'#999'}">${e.text.map(p=>`<p>${esc(p)}</p>`).join('')}</blockquote>${e.note?`<p class="note"><b>Note</b> ${esc(e.note)}</p>`:''}`;});
    body+='</article>';
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:18px/1.6 Georgia,serif;color:#2E2119;background:#FBF6EA;max-width:40rem;margin:0 auto;padding:2.5rem 1.2rem}h1,h2,h3{font-family:system-ui,sans-serif;line-height:1.15}h1{font-size:2.2rem}h2{margin-top:2.4rem}h3{color:#2F5A43;font-size:1.05rem;margin-top:1.8rem}.meta{color:#6B5A48;font:15px system-ui,sans-serif}blockquote{margin:1.1rem 0;padding:.2rem 0 .2rem 1rem;border-left:5px solid}blockquote p{margin:.3rem 0}.note{font:15px/1.5 system-ui,sans-serif;background:#F3EAD7;border-radius:10px;padding:.5rem .8rem;margin:-.4rem 0 1.4rem}article+article{border-top:2px solid #DCCBA8;margin-top:3rem}a{color:#2F5A43}.stamp{color:#6B5A48;font:14px system-ui,sans-serif}</style></head>
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
  EX.scope=DOC?scope:'shelf';$('#expScopeWrap').classList.toggle('hidden',!DOC);
  closeDrawers();openModal('#expM');
  await refreshExport();
}
$('#expScope').onclick=e=>{const b=e.target.closest('button');if(!b)return;EX.scope=b.dataset.s;refreshExport();};
$('#expFmt').onclick=e=>{const b=e.target.closest('button');if(!b)return;EX.fmt=b.dataset.f;prefs.exFmt=EX.fmt;savePrefs();refreshExport();};
$('#expNotesOnly').onchange=e=>{EX.notesOnly=e.target.checked;refreshExport();};
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
  const a=new Readability(doc).parse();
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
  NB.f='all';$('#nbQ').value='';$('#nbStats').innerHTML='';$('#nbCtrl').classList.add('hidden');
  $('#nbList').innerHTML='<div class="empty">Gathering your highlights…</div>';
  const books=await Promise.all(META.filter(m=>m.hl>0).map(async m=>{const [d,s]=await Promise.all([DB.get('doc:'+m.id),DB.get('state:'+m.id)]);return d&&s?{doc:d,hl:s.hl||[]}:null;}));
  if(run!==NB.run) return;
  NB.items=books.filter(Boolean).flatMap(({doc,hl})=>entriesFor(doc,hl).map(e=>Object.assign(e,{book:doc.id,title:doc.title,hay:nbFold([...e.text,e.note,doc.title,doc.author].join(' '))})))
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
  $('#nbChips').innerHTML=`<button class="chip" aria-pressed="${NB.f==='all'}" data-f="all">All ${base.length}</button>`+chip('note','With note')+COLORS.map(c=>chip(c[0],c[1],true)).join('');
  const list=base.filter(e=>NB.f==='all'||(NB.f==='note'?e.note:e.color===NB.f));
  $('#nbList').innerHTML=list.length?list.map(e=>`<div class="hcard" style="border-left-color:var(--${e.color}S)" tabindex="0" data-book="${e.book}" data-hl="${e.id}"><div class="sec"><b>${esc(e.title)}</b>${e.section?` · ${esc(e.section)}`:''}</div><p class="q">${e.text.map(esc).join(' <span style="color:var(--muted)">¶</span> ')}</p>${e.note?`<div class="nt">${esc(e.note)}</div>`:''}</div>`).join('')
    :'<div class="empty">Nothing matches.</div>';
}
const nbOpen=c=>{if(c&&getSelection().isCollapsed) openBook(c.dataset.book,{hl:c.dataset.hl});};
$('#nbBack').onclick=goShelf;
$('#nbQ').oninput=renderNotebook;
$('#nbBook').onchange=renderNotebook;
$('#nbChips').onclick=e=>{const b=e.target.closest('[data-f]');if(!b)return;NB.f=b.dataset.f;renderNotebook();};
$('#nbExp').onclick=()=>openExport('shelf');
$('#nbList').onclick=e=>nbOpen(e.target.closest('[data-hl]'));
$('#nbList').onkeydown=e=>{if(e.key==='Enter') nbOpen(e.target.closest('[data-hl]'));};

/* ================= settings, backup ================= */
function setErr(m){const e=$('#setErr');e.textContent=m;e.classList.remove('hidden');}
function openSettings(){
  const cloud=!!(DB&&DB.kind==='cloud'),u=cloud&&fb&&fb.auth.currentUser;
  $('#acct').textContent=cloud?`Signed in as ${(u&&u.email)||'your Google account'}`:'On this device only';
  $('#acctLocal').classList.toggle('hidden',cloud);
  $('#signOut').classList.toggle('hidden',!cloud);$('#signIn').classList.toggle('hidden',cloud||!fb);
  $('#sWorker').value=SETTINGS.workerUrl||'';$('#sWorker').placeholder=WORKER_URL||'https://own-shelf-fetch.example.workers.dev';$('#sWorker').disabled=!cloud;
  $('#setErr').classList.add('hidden');openModal('#setM');
}
$('#setBtn').onclick=openSettings;
$('#sSave').onclick=async()=>{
  const v=$('#sWorker').value.trim();
  if(v&&!/^(https:\/\/[^\s/]+|http:\/\/localhost[:/])/i.test(v)){setErr('The helper URL should start with https://');return;}
  if(DB&&v!==(SETTINGS.workerUrl||'')){SETTINGS={...SETTINGS,workerUrl:v};await DB.put('settings:app',SETTINGS);toast('Settings saved');}
  closeModal('#setM');
};
$('#backupBtn').onclick=async e=>{
  const b=e.currentTarget,label=b.textContent;b.disabled=true;b.textContent='Backing up…';
  try{
    await DB.flush();const data=await exportShelf(DB,META);
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
    const r=await importShelf(DB,data,META,metaFor);
    r.metas.forEach(m=>{META=META.filter(x=>x.id!==m.id).concat(m);});
    closeModal('#setM');renderShelf();
    toast(r.added||r.merged?`Restored ${r.added} book${r.added===1?'':'s'}${r.highlights?` and ${r.highlights} highlight${r.highlights===1?'':'s'}`:''}`:'Everything in that backup is already here');
  }catch(err){
    console.error(err);
    setErr(err.message==='not_backup'?'That file isn’t an own-shelf backup.':err.message==='newer_version'?'That backup comes from a newer version of own-shelf.':'The restore stopped partway. Run it again; books already restored are skipped.');
  }
};

/* ================= accounts ================= */
const FB=`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-`;
let fb=null,unwatch=()=>{},incoming=null;
const onShelf=()=>!$('#shelf').classList.contains('hidden');
function syncError(e){console.error(e);toast(e&&e.code==='permission-denied'?'Sync was refused. Check the Firestore rules.':'Couldn’t sync a change'+(e&&e.code?` (${e.code})`:''));}
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
  const last=ls.get('last',null);
  if(incoming){show('shelf');renderShelf();runIncoming();}
  else if(last&&META.find(m=>m.id===last)) openBook(last); else {show('shelf');renderShelf();}
}
const startLocal=()=>start(makeLocal({onError:()=>toast('Storage is full — some changes may not be saved')}));
function startCloud(user){
  if(DB&&DB.kind==='cloud'&&DB.uid===user.uid) return;
  ls.set('mode',null);
  start(makeCloud(fb.F,fb.db,user.uid,{onError:syncError}));
}
function showSignin(msg){
  unwatch();unwatch=()=>{};DB=null;META=[];DOC=null;ST=null;HL=[];SETTINGS={};
  document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
  show('signin');document.title='own-shelf';
  $('#siGoogle').classList.toggle('hidden',!fb);
  $('#siErr').textContent=msg||'';$('#siErr').classList.toggle('hidden',!msg);
}
function authError(e){
  console.error(e);
  const m=e&&e.code==='auth/unauthorized-domain'?'This site isn’t on the Firebase authorized domains list yet.':e&&e.code==='auth/network-request-failed'?'No connection. Try again when you’re online.':'Sign-in didn’t work'+(e&&e.code?` (${e.code})`:'')+'.';
  if($('#signin').classList.contains('hidden')) toast(m); else {$('#siErr').textContent=m;$('#siErr').classList.remove('hidden');}
}
async function signIn(){
  if(!fb){toast('Sign-in isn’t available right now. Check your connection and reload.');return;}
  const p=new fb.A.GoogleAuthProvider();
  try{await fb.A.signInWithPopup(fb.auth,p);}
  catch(e){
    if(e.code==='auth/popup-blocked'){try{await fb.A.signInWithRedirect(fb.auth,p);}catch(e2){authError(e2);}return;}
    if(e.code!=='auth/popup-closed-by-user'&&e.code!=='auth/cancelled-popup-request') authError(e);
  }
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

/* ================= deep links: ?add=, ?url=, ?text= (iOS Shortcut, Android share) ================= */
function readDeepLink(){
  const raw=new URLSearchParams(location.search);const v=raw.get('add')||raw.get('url')||raw.get('text')||'';
  if(!v.trim()) return;
  const url=firstUrl(v);incoming=url?{url}:{text:v};
}
async function runIncoming(){
  const x=incoming;incoming=null;if(!x) return;
  const q=new URLSearchParams(location.search);['add','url','text','title'].forEach(k=>q.delete(k));
  history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash);
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
  try{fb=await loadFirebase();}catch(e){console.warn('Firebase did not load',e);fb=null;}
  if(!fb){if(!local) showSignin('Sign-in isn’t available right now (offline?). You can still use own-shelf on this device only.');return;}
  fb.A.getRedirectResult(fb.auth).catch(authError);
  fb.A.onAuthStateChanged(fb.auth,user=>{
    if(user) startCloud(user);
    else if(ls.get('mode',null)==='local'){if(!DB||DB.kind!=='local') startLocal();}
    else showSignin();
  });
})();
