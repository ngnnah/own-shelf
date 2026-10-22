// ===== PARSE START =====
const MONTHS=['january','february','march','april','may','june','july','august','september','october','november','december'];
const MON_RE='(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
function monthIdx(s){s=s.toLowerCase().replace('.','');return MONTHS.findIndex(m=>m.startsWith(s.slice(0,3)));}
function parseDate(s){
  if(!s) return '';
  s=String(s).trim();
  let m=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if(m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m=s.match(new RegExp('('+MON_RE+')\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})','i')); if(m) return `${m[3]}-${String(monthIdx(m[1])+1).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  m=s.match(new RegExp('(\\d{1,2})\\s+('+MON_RE+'),?\\s+(\\d{4})','i')); if(m) return `${m[3]}-${String(monthIdx(m[2])+1).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  m=s.match(new RegExp('('+MON_RE+'),?\\s+(\\d{4})','i')); if(m) return `${m[2]}-${String(monthIdx(m[1])+1).padStart(2,'0')}-01`;
  m=s.match(/\b(1[5-9]\d\d|20\d\d)\b/); if(m) return `${m[1]}-01-01`;
  return '';
}
function isDateLine(t){
  t=t.trim(); if(t.length>48) return false;
  const core=t.replace(/^(published|posted|updated|written|last updated|date)\s*(on|:)?\s*/i,'').replace(/[.]$/,'');
  return new RegExp('^(?:'+MON_RE+'\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|\\d{1,2}\\s+'+MON_RE+',?\\s+\\d{4}|'+MON_RE+',?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2})$','i').test(core);
}
const BULLET=/^[•●▪◦‣■□➢►✓✔–]\s*/;

/* ---------- PDF ---------- */
function linesFromPages(pages){
  let lines=[];
  pages.forEach((items,pi)=>{
    const rows=[];
    items.forEach(it=>{
      if(!it.str || !it.str.trim()) return;
      const x=it.transform[4], y=it.transform[5], h=Math.abs(it.transform[3])||it.height||10;
      let row=rows.find(r=>Math.abs(r.y-y)<Math.max(2,h*0.35));
      if(!row){row={y,h,items:[]};rows.push(row);}
      row.items.push({x,w:it.width||0,s:it.str,h});
    });
    rows.sort((a,b)=>b.y-a.y);
    rows.forEach(r=>{
      r.items.sort((a,b)=>a.x-b.x);
      let txt='',end=null;
      r.items.forEach(i=>{
        if(end!==null){const gap=i.x-end; if(gap>i.h*0.15 && !/\s$/.test(txt) && !/^\s/.test(i.s)) txt+=' ';}
        txt+=i.s; end=i.x+i.w;
      });
      txt=txt.replace(/\s+/g,' ').trim();
      if(!txt) return;
      lines.push({page:pi,x:r.items[0].x,y:r.y,h:r.h,right:end,text:txt});
    });
  });
  // repeated headers / footers + page numbers
  let source='',titleHint='';
  const nPages=pages.length;
  if(nPages>=2){
    const freq={};
    for(let p=0;p<nPages;p++){
      const pl=lines.filter(l=>l.page===p); const edge=[...pl.slice(0,2),...pl.slice(-2)];
      new Set(edge.map(l=>l.text.replace(/\d+/g,'#'))).forEach(k=>freq[k]=(freq[k]||0)+1);
    }
    const need=Math.max(2,Math.ceil(nPages*0.5));
    lines=lines.filter((l,i)=>{
      const pl=lines.filter(x=>x.page===l.page); const idx=pl.indexOf(l);
      const atEdge=idx<2||idx>=pl.length-2;
      const k=l.text.replace(/\d+/g,'#');
      if(atEdge && (freq[k]>=need || /^(page\s*)?\d+(\s*(\/|of)\s*\d+)?$/i.test(l.text))){
        const u=l.text.match(/https?:\/\/\S+/); if(u&&!source) source=u[0];
        const hd=l.text.match(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:[AP]M)?\s+(.+)$/i); if(hd&&!titleHint) titleHint=hd[1].trim();
        return false;
      }
      return true;
    });
  }
  // keep the main text column
  const counts={};
  lines.filter(l=>l.text.length>40).forEach(l=>{const k=Math.round(l.x/4)*4;counts[k]=(counts[k]||0)+1;});
  let left=null,best=0;for(const k in counts){if(counts[k]>best){best=counts[k];left=+k;}}
  if(left!==null) lines=lines.filter(l=>l.x>=left-14);
  return {lines,source,titleHint};
}
function blocksFromLines(lines){
  if(!lines.length) return [];
  const gaps=[];
  for(let i=1;i<lines.length;i++){ if(lines[i].page===lines[i-1].page){const g=lines[i-1].y-lines[i].y; if(g>0) gaps.push(g);} }
  gaps.sort((a,b)=>a-b);
  const lh=gaps.length?gaps[Math.floor(gaps.length*0.3)]:12;
  const rights=lines.map(l=>l.right).sort((a,b)=>a-b);
  const maxRight=rights[Math.floor(rights.length*0.9)]||0;
  const out=[];let cur=null;
  lines.forEach((l,i)=>{
    let text=l.text, li=null;
    const prev=lines[i-1];
    if(BULLET.test(text)){li='ul';text=text.replace(BULLET,'');}
    else if(/^\d{1,2}[.)]\s+\S/.test(text) && cur && (cur.list==='ol' || /:$/.test(prev?prev.text:''))){li='ol';}
    if(!cur){cur={t:li?'li':'p',list:li||undefined,depth:0,text,brk:false};out.push(cur);return;}
    let newPara=!!li,brk=false;
    if(l.page===prev.page){const g=prev.y-l.y; if(g>lh*1.45) newPara=true; if(g>lh*3.2) brk=true;}
    else{
      const full=prev.right>=maxRight*0.86, terminal=/[.?!:"”)\]]$/.test(prev.text), lower=/^[a-z]/.test(text);
      if(!(lower||(full&&!terminal))) newPara=true;
    }
    if(newPara){
      if(li==='ol'){const m=text.match(/^(\d{1,2})[.)]\s+/); text=text.slice(m[0].length); cur={t:'li',list:'ol',depth:0,num:+m[1],text,brk};}
      else cur={t:li?'li':'p',list:li||undefined,depth:0,text,brk};
      out.push(cur);
    } else {
      if(/-$/.test(cur.text) && /^[A-Za-z]/.test(text)) cur.text+=text; else cur.text+=' '+text;
    }
  });
  out.forEach(b=>{b.marks=autoLinks(b.text);});
  return out;
}
function autoLinks(text){
  const marks=[];const re=/https?:\/\/[^\s<>()"]+[^\s<>().,;:!?'"]/g;let m;
  while((m=re.exec(text))) marks.push({k:'a',s:m.index,e:m.index+m[0].length,href:m[0]});
  return marks;
}

/* ---------- Markdown / plain text ---------- */
function inlineMD(str){
  let text='';const marks=[];
  const re=/(`([^`]+)`)|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*\s][^*]*?)\*)|(\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\))|(https?:\/\/[^\s<>()"]+[^\s<>().,;:!?'"])/g;
  let last=0,m;
  while((m=re.exec(str))){
    text+=str.slice(last,m.index); const s=text.length;
    if(m[1]){text+=m[2];marks.push({k:'code',s,e:text.length});}
    else if(m[3]||m[5]){text+=(m[4]||m[6]);marks.push({k:'b',s,e:text.length});}
    else if(m[7]){text+=m[8];marks.push({k:'i',s,e:text.length});}
    else if(m[9]){text+=m[10];marks.push({k:'a',s,e:text.length,href:m[11]});}
    else if(m[12]){text+=m[12];marks.push({k:'a',s,e:text.length,href:m[12]});}
    last=m.index+m[0].length;
  }
  text+=str.slice(last);
  return {text,marks};
}
function mdToBlocks(raw){
  const lines=raw.replace(/\r/g,'').replace(/\u00a0/g,' ').split('\n');
  const hasBlank=lines.some((l,i)=>!l.trim()&&i>0&&i<lines.length-1);
  const out=[];let para=null,blank=0,code=null;
  const flush=()=>{if(para){const r=inlineMD(para.raw.replace(/\s+/g,' ').trim());if(r.text){para.text=r.text;para.marks=r.marks;delete para.raw;out.push(para);}}para=null;};
  lines.forEach(line=>{
    if(/^\s*```/.test(line)){ if(code){out.push(code);code=null;} else {flush();code={t:'code',text:'',marks:[]};} return; }
    if(code){code.text+=(code.text?'\n':'')+line;return;}
    if(!line.trim()){flush();blank++;return;}
    const brk=blank>=2; blank=0;
    let m;
    if((m=line.match(/^(#{1,6})\s+(.*)$/))){flush();const r=inlineMD(m[2].replace(/#+\s*$/,'').trim());out.push({t:'h',level:m[1].length,text:r.text,marks:r.marks,brk});return;}
    if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)){flush();out.push({t:'hr'});return;}
    if((m=line.match(/^\s*!\[([^\]]*)\]\(((?:https?:|data:image\/)[^)\s]+)\)\s*$/))){flush();out.push({t:'img',src:m[2],alt:m[1]});return;}
    if((m=line.match(/^(\s*)([-*+•●▪◦]|(\d{1,3})[.)])\s+(.*)$/))){
      flush();const depth=Math.min(4,Math.floor(m[1].replace(/\t/g,'  ').length/2));
      para={t:'li',list:m[3]?'ol':'ul',num:m[3]?+m[3]:undefined,depth,raw:m[4],brk};
      if(!hasBlank) flush();
      return;
    }
    if((m=line.match(/^\s*>\s?(.*)$/))){ if(para&&para.t==='quote') para.raw+=' '+m[1]; else {flush();para={t:'quote',raw:m[1],brk};} if(!hasBlank) flush(); return;}
    if(para && hasBlank && para.t!=='quote'){para.raw+=' '+line.trim();return;}
    flush(); para={t:'p',raw:line.trim(),brk}; if(!hasBlank) flush();
  });
  flush(); if(code) out.push(code);
  return out;
}

/* ---------- rich HTML ---------- */
function htmlToBlocks(html){
  const dom=new DOMParser().parseFromString(html,'text/html');
  dom.querySelectorAll('script,style,noscript,iframe,svg,button,nav,form,input,select,textarea,template,object,video,audio,canvas,meta,link').forEach(n=>n.remove());
  const out=[];let cur=null,quote=0,inLi=0,brRun=0,pendingBrk=false;const lists=[];
  const flush=()=>{
    if(cur){
      const lead=cur.text.length-cur.text.trimStart().length; cur.text=cur.text.trim();
      cur.marks=cur.marks.map(m=>({...m,s:Math.max(0,m.s-lead),e:Math.min(cur.text.length,m.e-lead)})).filter(m=>m.e>m.s);
      if(cur.text){ if(pendingBrk){cur.brk=true;pendingBrk=false;} out.push(cur); }
    }
    cur=null;
  };
  const open=(t,extra)=>{flush();cur=Object.assign({t,text:'',marks:[]},extra||{});};
  const append=(s,f)=>{
    s=s.replace(/[\s\u00a0]+/g,' ');
    if(!cur){ if(!s.trim()) return; cur={t:quote?'quote':'p',text:'',marks:[]}; }
    if((cur.text===''||/\s$/.test(cur.text)) && s.startsWith(' ')) s=s.slice(1);
    if(!s) return;
    if(s.trim()) brRun=0;
    const st=cur.text.length; cur.text+=s; const en=cur.text.length;
    if(f.b) cur.marks.push({k:'b',s:st,e:en}); if(f.i) cur.marks.push({k:'i',s:st,e:en});
    if(f.code) cur.marks.push({k:'code',s:st,e:en}); if(f.a) cur.marks.push({k:'a',s:st,e:en,href:f.a});
  };
  const BLOCK=/^(P|DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|FIGURE|DD|DT|DL|TR|TABLE|TBODY|THEAD|TFOOT|CENTER|ADDRESS|DETAILS|SUMMARY|CAPTION)$/;
  function kids(n,f){ n.childNodes.forEach(c=>walk(c,f)); }
  function walk(n,f){
    if(n.nodeType===3){append(n.nodeValue,f);return;}
    if(n.nodeType!==1) return;
    const tag=n.tagName, st=(n.getAttribute('style')||'').toLowerCase();
    if(n.getAttribute('aria-hidden')==='true'||n.hidden||/display\s*:\s*none/.test(st)) return;
    let g=f;
    const fw=st.match(/font-weight\s*:\s*(\w+)/), fs=st.match(/font-style\s*:\s*(\w+)/);
    let b=f.b,i=f.i;
    if(/^(B|STRONG)$/.test(tag)) b=true;
    if(fw) b=/bold|[6-9]00/.test(fw[1]);
    if(/^(I|EM|CITE)$/.test(tag)) i=true;
    if(fs) i=fs[1]==='italic'||fs[1]==='oblique';
    const code=f.code||/^(CODE|KBD|SAMP|TT)$/.test(tag);
    let a=f.a; if(tag==='A'){const h=n.getAttribute('href')||''; if(/^(https?:|mailto:)/i.test(h)) a=h;}
    if(b!==f.b||i!==f.i||code!==f.code||a!==f.a) g={b,i,code,a};
    if(/^H[1-6]$/.test(tag)){open('h',{level:+tag[1]});kids(n,{...g,b:false});flush();return;}
    if(tag==='UL'||tag==='OL'){flush();lists.push({type:tag==='OL'?'ol':'ul',n:(parseInt(n.getAttribute('start'))||1)-1});kids(n,g);lists.pop();flush();return;}
    if(tag==='LI'){const L=lists[lists.length-1]||{type:'ul',n:0};L.n++;open('li',{list:L.type,depth:Math.max(0,lists.length-1),num:L.n});inLi++;kids(n,g);inLi--;flush();return;}
    if(tag==='BLOCKQUOTE'){flush();quote++;kids(n,g);flush();quote--;return;}
    if(tag==='PRE'){flush();const t=n.textContent.replace(/\n+$/,'');if(t.trim()) out.push({t:'code',text:t,marks:[]});return;}
    if(tag==='PICTURE'){const im=n.querySelector('img');if(im) walk(im,g);return;}
    if(tag==='IMG'){
      const src=n.getAttribute('src')||n.getAttribute('data-src')||'';
      if(!/^(https?:|data:image\/)/i.test(src)) return;
      const w=parseInt(n.getAttribute('width'))||0,h=parseInt(n.getAttribute('height'))||0;
      if((w&&w<64)||(h&&h<48)) return;
      flush();out.push({t:'img',src,alt:n.getAttribute('alt')||''});return;
    }
    if(tag==='HR'){flush();out.push({t:'hr'});return;}
    if(tag==='BR'){ if(cur&&(cur.t==='li'||cur.t==='h')){append(' ',g);return;} flush(); brRun++; if(brRun>=3&&out.length) pendingBrk=true; return; }
    if(tag==='TD'||tag==='TH'){ if(cur&&cur.text.trim()) append(' | ',{}); kids(n,g); return; }
    if(tag==='FIGCAPTION'){open('cap');kids(n,g);flush();return;}
    if(BLOCK.test(tag)){
      if(inLi&&cur&&cur.t==='li'){ if(cur.text.trim()) append(' ',{}); kids(n,g); return; }
      flush();kids(n,g);flush();return;
    }
    kids(n,g);
  }
  walk(dom.body,{b:false,i:false,code:false,a:null});
  flush();
  // attach captions, merge adjacent marks
  const res=[];
  out.forEach(b=>{
    if(b.t==='cap'){const p=res[res.length-1]; if(p&&p.t==='img'&&!p.caption){p.caption=b.text;return;} b.t='p';}
    if(b.marks) b.marks=mergeMarks(b.marks);
    res.push(b);
  });
  return res;
}
function mergeMarks(ms){
  const r=[];ms.sort((a,b)=>a.k.localeCompare(b.k)||(a.href||'').localeCompare(b.href||'')||a.s-b.s);
  ms.forEach(m=>{const l=r[r.length-1]; if(l&&l.k===m.k&&(l.href||'')===(m.href||'')&&m.s<=l.e) l.e=Math.max(l.e,m.e); else r.push({...m});});
  return r;
}

/* ---------- remove ranges from text, remapping marks ---------- */
function cutRanges(b,ranges){
  if(!ranges.length) return;
  ranges.sort((a,z)=>a[0]-z[0]);
  const np=x=>{let d=0;for(const [a,z] of ranges){ if(x>=z) d+=z-a; else if(x>a){d+=x-a;} }return x-d;};
  let t='',last=0; ranges.forEach(([a,z])=>{t+=b.text.slice(last,a);last=z;}); t+=b.text.slice(last);
  b.marks=(b.marks||[]).map(m=>({...m,s:np(m.s),e:np(m.e)})).filter(m=>m.e>m.s);
  b.text=t; return np;
}

/* ---------- finalize into a document ---------- */
function same(a,b){return !!a&&!!b&&a.toLowerCase().replace(/[^a-z0-9]/g,'')===b.toLowerCase().replace(/[^a-z0-9]/g,'');}
function finalize(blocks,o){
  o=o||{};
  blocks=JSON.parse(JSON.stringify(blocks)).filter(b=>b.t==='img'||b.t==='hr'||(b.text&&b.text.trim()));
  blocks.forEach(b=>{if(b.text!==undefined){b.marks=b.marks||[];b.fns=[];}});
  let title=o.title||'',strong=!!o.title,author=o.author||'',written=o.written||'';
  let k=0,guard=0;
  while(!o.verbatim&&k<blocks.length&&guard++<10){
    const b=blocks[k];
    if(b.t==='img'||b.t==='hr'){k++;continue;}
    const tx=b.text.trim();
    if(isDateLine(tx)){if(!written) written=tx.replace(/^(published|posted|updated|written|last updated|date)\s*(on|:)?\s*/i,'');blocks.splice(k,1);continue;}
    const by=tx.match(/^(?:by|written by|author:?)\s+(.{2,90})$/i);
    if(by&&tx.length<110){
      const parts=by[1].split(/\s*[·•|—–]\s*|,\s(?=[A-Z][a-z]+\s+\d)/);
      if(!author) author=parts[0].trim();
      parts.slice(1).forEach(p=>{if(!written&&parseDate(p)) written=p.trim();});
      blocks.splice(k,1);continue;
    }
    if(b.t==='h'&&b.level<=2&&k<=1&&(!strong&&!title||same(title,tx))){ if(!strong) title=tx; strong=true; blocks.splice(k,1); continue; }
    if(same(title,tx)||same(o.hint,tx)){ if(!strong) title=tx; strong=true; blocks.splice(k,1); continue; }
    if(!strong&&!title&&k===0&&b.t==='p'&&tx.length<90&&!/[.?!,;:]$/.test(tx)&&tx.split(/\s+/).length<=14){title=tx;strong=true;blocks.splice(k,1);continue;}
    break;
  }
  if(!title) title=o.hint||((blocks.find(b=>b.text)||{}).text||'Untitled').split(/\s+/).slice(0,8).join(' ');
  // notes
  let ni=-1;const from=Math.floor(blocks.length*0.4);
  for(let i=from;!o.verbatim&&i<blocks.length;i++){const b=blocks[i];if(b.text&&/^(notes|footnotes|endnotes)$/i.test(b.text.trim())){ni=i;break;}}
  let body=blocks,tail=[];
  if(ni>=0){body=blocks.slice(0,ni);tail=blocks.slice(ni+1);}
  else if(!o.verbatim){
    const gi=blocks.findIndex((b,i)=>i>=from&&b.t==='p'&&/^Notes\s*\[1\]/.test(b.text));
    if(gi>=0){blocks[gi].text=blocks[gi].text.replace(/^Notes\s*/,'');body=blocks.slice(0,gi);tail=blocks.slice(gi);}
    else{
      const li=blocks.length-1-[...blocks].reverse().findIndex(b=>b.t==='p');
      const lb=blocks[li]; const m=lb&&lb.text.match(/^(.*?)Notes\s*(\[1\][\s\S]*)$/);
      if(m){body=blocks.slice(0,li+1);tail=[{t:'p',text:m[2]}].concat(blocks.slice(li+1));lb.text=m[1].trim();}
    }
  }
  let thanks='';const notes=[];
  tail.forEach(p=>{
    if(!p.text) return;
    let t=p.text;
    const th=t.match(/^(.*?)\s*((?:Thanks|Thank you) to .*)$/);
    if(th){thanks=th[2];t=th[1];if(!t) return;}
    t.split(/(?=\[\d+\]\s)/).forEach(part=>{
      const m=part.match(/^\[(\d+)\]\s*([\s\S]*)$/);
      if(m) notes.push({n:+m[1],text:m[2].trim()});
      else if(notes.length) notes[notes.length-1].text+=' '+part.trim();
      else if(part.trim()) notes.push({n:0,text:part.trim()});
    });
  });
  const noteSet=new Set(notes.map(n=>n.n));
  body.forEach((b,i)=>{
    b.id='b'+i;
    if(!noteSet.size||!b.text||b.t==='code'||b.t==='h') return;
    const re=/\s?\[(\d{1,3})\]/g;let m;const rng=[],refs=[];
    while((m=re.exec(b.text))){if(noteSet.has(+m[1])){rng.push([m.index,m.index+m[0].length]);refs.push({n:+m[1],a:m.index});}}
    if(rng.length){const np=cutRanges(b,rng);b.fns=refs.map(r=>({n:r.n,at:np(r.a)}));}
  });
  const doc={v:2,title:title.trim(),author:author.trim(),written:written.trim(),writtenSort:parseDate(written),source:o.source||'',
    blocks:body,notes:notes.map(n=>({id:'n'+n.n,n:n.n,text:n.text.replace(/\s+/g,' ').trim()})),thanks};
  computeSections(doc);
  return doc;
}
function computeSections(doc){
  const B=doc.blocks;const hs=B.filter(b=>b.t==='h');
  let secLevel=0;
  if(hs.length){const lv=[1,2,3,4,5,6].filter(l=>hs.filter(h=>h.level===l).length>=2);secLevel=lv.length?lv[0]:Math.min(...hs.map(h=>h.level));}
  const useBrk=!hs.length&&B.some((b,i)=>i>0&&b.brk);
  const secs=[];let cur=null,textCount=0;
  const teaser=b=>(b&&b.text?b.text.split(/\s+/).slice(0,7).join(' ').replace(/[,;:.]$/,'')+'…':'Images');
  B.forEach((b,i)=>{
    let start=i===0;
    if(secLevel&&b.t==='h'&&b.level<=secLevel) start=true;
    else if(useBrk&&b.brk) start=true;
    else if(!secLevel&&!useBrk&&b.text&&textCount>=9) start=true;
    if(start){cur={i:secs.length,heading:(b.t==='h'&&secLevel&&b.level<=secLevel)?b.id:null,subs:[],words:0};secs.push(cur);textCount=0;}
    if(b.t==='h'&&!(cur.heading===b.id)) cur.subs.push({id:b.id,title:b.text});
    b.sec=cur.i; if(b.text){textCount++;cur.words+=b.text.split(/\s+/).length;}
  });
  secs.forEach(s=>{const first=B.find(b=>b.sec===s.i&&b.text&&b.t!=='h');const hb=s.heading&&B.find(b=>b.id===s.heading);s.title=hb?hb.text:teaser(first);s.auto=!hb;});
  doc.sections=secs; doc.secLevel=secLevel;
  doc.words=B.reduce((a,b)=>a+(b.text?b.text.split(/\s+/).length:0),0)+(doc.notes||[]).reduce((a,n)=>a+n.text.split(/\s+/).length,0);
}
/* ---------- Kindle notebook export ---------- */
// Kindle's "Notebook Export" .html holds the highlights, not the book. Its markup is machine-made and regular, so it is
// read as text (no DOMParser, so Node tests run it): each tag with one of these classes starts an item that runs to the
// next one. Older exports use <h3> headings and close noteText with </h3>; that works too.
const KINDLE_TAG=/<([a-z][a-z0-9]*)\b[^>]*\bclass\s*=\s*["']?(bookTitle|authors|sectionHeading|noteHeading|noteText)\b[^>]*>/gi;
const KINDLE_COLORS={yellow:'sun',orange:'coral',pink:'coral',red:'coral',blue:'sky',purple:'sky',green:'mint',aqua:'mint'};
const ENTITIES={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function isKindleNotebook(html){return /\bclass\s*=\s*["']?noteHeading\b/i.test(html)&&/\bclass\s*=\s*["']?noteText\b/i.test(html);}
function htmlText(s){
  return s.replace(/<br\s*\/?>/gi,' ').replace(/<[^>]*>/g,'')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,e)=>{
      if(e[0]!=='#') return ENTITIES[e.toLowerCase()]||m;
      const n=/x/i.test(e[1])?parseInt(e.slice(2),16):+e.slice(1);return n>0&&n<0x110000?String.fromCodePoint(n):m;})
    .replace(/[\s ]+/g,' ').trim();
}
// "Abercrombie, Joe" → "Joe Abercrombie"; several authors come separated by semicolons.
const flipName=s=>s.split(/\s*;\s*/).map(p=>{const m=p.match(/^([^,]+),\s*([^,]+)$/);return m?m[2]+' '+m[1]:p;}).join(', ');
// "Highlight(yellow) - Like a King > Page 4 · Location 133", "Note - Page 4 · Location 134", "Bookmark - Location 60"
function kindleHead(s){
  const m=/^(.*?)\s*(?:\(([^)]*)\))?\s+[-–—]\s+(.*)$/.exec(s)||[s,s,'',''];
  const color=(m[2]||'').trim().toLowerCase(),parts=m[3].split(/\s+>\s+/),end=parts[parts.length-1];
  const where=/\b(page|location)\b/i.test(end);
  return {kind:/^bookmark/i.test(m[1])?'bookmark':color?'highlight':/^note/i.test(m[1])?'note':'highlight',
    color:KINDLE_COLORS[color]||'sun',chapter:(where?parts.slice(0,-1):parts).join(' > '),loc:+((/location\s+(\d+)/i.exec(end)||[])[1])||null};
}
// A note belongs to the highlight just before it when its location falls inside that passage (about 60 characters a
// location, plus slack). Without locations, it belongs to the one before it.
const noteFits=(b,h)=>b.kh.loc==null||h.loc==null||(h.loc>=b.kh.loc&&h.loc-b.kh.loc<=Math.ceil(b.text.length/60)+2);
// → {title, author, blocks}. Parts become h2, chapters h3 (again after each new part), each highlight a paragraph that
// carries kh:{color, note, loc} for kindleHighlights(). A note on no highlight is a passage of its own. Bookmarks are skipped.
function kindleNotebook(html){
  html=html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'');
  const tags=[];let m;KINDLE_TAG.lastIndex=0;
  while((m=KINDLE_TAG.exec(html))) tags.push({cls:m[2].toLowerCase(),from:m.index+m[0].length,at:m.index});
  let title='',author='',sec='',chap='',head=null,last=null;const blocks=[];
  tags.forEach((t,i)=>{
    const text=htmlText(html.slice(t.from,i+1<tags.length?tags[i+1].at:html.length));
    if(t.cls==='booktitle'){title=title||text;return;}
    if(t.cls==='authors'){author=author||flipName(text);return;}
    if(t.cls==='sectionheading'){if(text){blocks.push({t:'h',level:2,text,marks:[]});sec=text;chap='';last=null;}return;}
    if(t.cls==='noteheading'){head=kindleHead(text);return;}
    const h=head;head=null;
    if(!h||!text||h.kind==='bookmark') return;
    if(h.chapter&&h.chapter!==chap){chap=h.chapter;if(chap!==sec){blocks.push({t:'h',level:3,text:chap,marks:[]});last=null;}}
    if(h.kind==='note'){
      if(last&&noteFits(last,h)) last.kh.note=last.kh.note?last.kh.note+'\n\n'+text:text;
      else{blocks.push({t:'p',text,marks:[],kh:{color:'sun',note:text,loc:h.loc}});last=null;}
      return;
    }
    last={t:'p',text,marks:[],kh:{color:h.color,note:'',loc:h.loc}};blocks.push(last);
  });
  return {title,author,blocks};
}
// After finalize(): one full-passage highlight per kh block, newest first in book order. Removes kh from the blocks.
function kindleHighlights(doc,at){
  const hl=[];
  doc.blocks.forEach(b=>{if(!b.kh) return;const k=b.kh,i=hl.length;delete b.kh;
    hl.push({id:'h'+at.toString(36)+i.toString(36).padStart(3,'0'),color:k.color,note:k.note||'',segs:[{pid:b.id,s:0,e:b.text.length}],at:at-i});});
  return hl;
}
// A newer export of a Kindle book on the shelf. Old blocks map to new ones by type and text, in order, so the old
// highlights (own-shelf colours, notes, partial highlights) move to the new doc; a Kindle highlight is added only for a
// passage that wasn't there before. Highlights on passages gone from the new export are dropped.
// → {hl, added, dropped, same}; same: the export holds exactly the old passages.
function mergeKindle(oldDoc,oldHl,newDoc,newHl){
  const key=b=>b.t+'\u0001'+b.text,free=new Map();
  newDoc.blocks.forEach(b=>{if(b.text===undefined) return;const k=key(b);if(!free.has(k)) free.set(k,[]);free.get(k).push(b.id);});
  const map={};let olds=0;
  oldDoc.blocks.forEach(b=>{if(b.text===undefined) return;olds++;const q=free.get(key(b));if(q&&q.length) map[b.id]=q.shift();});
  const had=new Set(Object.values(map));let dropped=0;const hl=[];
  oldHl.forEach(h=>{const segs=h.segs.map(s=>map[s.pid]&&Object.assign({},s,{pid:map[s.pid]}));if(segs.length&&segs.every(Boolean)) hl.push(Object.assign({},h,{segs}));else dropped++;});
  const add=newHl.filter(h=>!had.has(h.segs[0].pid));
  const news=newDoc.blocks.filter(b=>b.text!==undefined).length;
  return {hl:hl.concat(add),added:add.length,dropped,same:had.size===olds&&olds===news};
}

/* ---------- links ---------- */
// First http(s) link in shared text, without trailing punctuation or brackets.
function firstUrl(s){const m=String(s||'').match(/https?:\/\/[^\s<>"'“”‘’]+/i);return m?m[0].replace(/[.,;:!?)\]}>]+$/,''):'';}
const isLoneUrl=s=>/^\s*https?:\/\/\S+\s*$/i.test(String(s||''));
// Readability keeps the best-scoring block and its strong siblings. An <article>'s <header> (title, standfirst,
// summary box) scores too low as a whole and is dropped; unwrapped, its paragraphs are judged one by one.
function liftArticleHeaders(doc){doc.querySelectorAll('article header').forEach(h=>h.replaceWith(...h.childNodes));return doc;}
// Fetched bytes → text, honouring the charset in the Content-Type header or a <meta> tag.
function decodeBody(buf,type){
  let cs=(/charset=["']?([\w-]+)/i.exec(type||'')||[])[1];
  if(!cs){const head=new TextDecoder('latin1').decode(new Uint8Array(buf).slice(0,4096));cs=(/<meta[^>]+charset=["']?([\w-]+)/i.exec(head)||[])[1];}
  try{return new TextDecoder(cs||'utf-8').decode(buf);}catch(e){return new TextDecoder('utf-8').decode(buf);}
}
// ===== PARSE END =====
if(typeof module!=='undefined') module.exports={linesFromPages,blocksFromLines,mdToBlocks,finalize,parseDate,isDateLine,inlineMD,firstUrl,isLoneUrl,decodeBody,isKindleNotebook,kindleNotebook,kindleHighlights,mergeKindle};
