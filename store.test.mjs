import {makeLocal,makeCloud,exportShelf,importShelf} from './store.js';
import {ok,done} from './test-util.mjs';

// In-memory stand-in for the firebase-firestore module. It rejects what real Firestore rejects:
// undefined values, arrays directly inside arrays, and documents over 1 MiB.
function fakeFirestore(){
  const docs=new Map(),subs=[];let writes=0;
  const bad=v=>v===undefined||(Array.isArray(v)?v.some(x=>Array.isArray(x)||bad(x)):v&&typeof v==='object'&&Object.values(v).some(bad));
  const snap=p=>({id:p.split('/').pop(),ref:{path:p},exists:()=>docs.has(p),data:()=>docs.has(p)?structuredClone(docs.get(p)):undefined});
  const query=p=>{const d=[...docs.keys()].filter(k=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).map(snap);return {empty:!d.length,docs:d,metadata:{fromCache:false}};};
  const notify=()=>subs.forEach(s=>s.cb(query(s.path)));
  const fs={
    doc:(db,...p)=>({path:p.join('/')}),collection:(db,...p)=>({path:p.join('/')}),
    async setDoc(r,v){if(bad(v))throw new Error('invalid data');if(JSON.stringify(v).length>1048576)throw new Error('too big');writes++;docs.set(r.path,structuredClone(v));notify();},
    async deleteDoc(r){docs.delete(r.path);notify();},
    getDoc:async r=>snap(r.path),getDocFromCache:async r=>snap(r.path),
    getDocs:async c=>query(c.path),getDocsFromCache:async c=>query(c.path),
    onSnapshot(c,cb){const s={path:c.path,cb};subs.push(s);cb(query(c.path));return()=>subs.splice(subs.indexOf(s),1);}
  };
  return {fs,docs,writes:()=>writes};
}
const tick=()=>new Promise(r=>setTimeout(r,0));
const errs=[];

// cloud: book content is chunked and reassembled
{
  const F=fakeFirestore();const C=makeCloud(F.fs,{},'u1',{onError:e=>errs.push(e)});
  const blocks=Array.from({length:300},(_,i)=>({t:'p',id:'b'+i,text:'x'.repeat(5000),marks:[],fns:[],sec:0}));
  await C.put('doc:a',{id:'a',title:'T',blocks,sections:[{i:0,subs:[]}],notes:[],extra:undefined});await tick();
  const n=[...F.docs.keys()].filter(k=>k.startsWith('users/u1/books/a/chunks/')).length;
  const got=await C.get('doc:a');
  ok('cloud: doc split into several chunks',n>1&&F.docs.get('users/u1/books/a').nChunks===n);
  ok('cloud: doc round-trips',got.blocks.length===300&&got.blocks[299].id==='b299'&&got.title==='T'&&!('nChunks' in got));
  await C.put('doc:a',{id:'a',title:'T2',blocks:blocks.slice(0,3),sections:[],notes:[]});await tick();await tick();
  const left=[...F.docs.keys()].filter(k=>k.startsWith('users/u1/books/a/chunks/')).length;
  ok('cloud: shorter version removes leftover chunks',left===1&&(await C.get('doc:a')).blocks.length===3);
  await C.del('doc:a');await tick();
  ok('cloud: delete removes header and chunks',![...F.docs.keys()].some(k=>k.startsWith('users/u1/books/a')));
}

// cloud: reading position and highlights are coalesced
{
  const F=fakeFirestore();const C=makeCloud(F.fs,{},'u1',{onError:e=>errs.push(e),delay:10000});
  for(let i=0;i<50;i++) await C.put('state:a',{pos:i,hl:[],note:undefined});
  ok('cloud: no writes before flush',F.writes()===0);
  ok('cloud: get sees the queued value',(await C.get('state:a')).pos===49);
  await C.flush();
  ok('cloud: flush writes once with the latest value',F.writes()===1&&F.docs.get('users/u1/state/a').pos===49);
  await C.put('settings:app',{workerUrl:'https://w.example'});
  ok('cloud: settings write straight away',F.docs.get('users/u1/settings/app').workerUrl==='https://w.example');
}

// cloud: the live shelf includes queued shelf entries
{
  const F=fakeFirestore();const C=makeCloud(F.fs,{},'u1',{delay:10000});
  await F.fs.setDoc({path:'users/u1/meta/a'},{id:'a',title:'Old'});
  await C.put('meta:a',{id:'a',title:'New'});await C.put('meta:b',{id:'b',title:'B'});
  let seen=null;C.watchMeta(l=>{seen=l;});
  ok('cloud: watchMeta merges queued entries',seen.length===2&&seen.find(m=>m.id==='a').title==='New');
  await C.flush();
}

// local adapter without IndexedDB (memory fallback, as in Node)
{
  const L=makeLocal();await L.open();
  await L.put('meta:a',{id:'a'});await L.put('meta:b',{id:'b'});await L.put('doc:a',{id:'a'});
  let seen=null;L.watchMeta(l=>{seen=l;});await tick();
  ok('local: all() filters by prefix',(await L.all('meta:')).length===2);
  ok('local: watchMeta reports the shelf once',seen&&seen.length===2);
}

// backup and restore
{
  const metaFor=(d,s)=>({id:d.id,title:d.title,hl:(s.hl||[]).length});
  const A=makeLocal();await A.open();
  const book=(id,hl)=>({doc:{id,title:'Book '+id,blocks:[{t:'p',id:'b0',text:'hi'}],sections:[]},state:{hl,pos:0,maxP:0,done:[]}});
  for(const [id,hl] of [['x',[{id:'h1'},{id:'h2'}]],['y',[]]]){const b=book(id,hl);await A.put('doc:'+id,b.doc);await A.put('state:'+id,b.state);await A.put('meta:'+id,metaFor(b.doc,b.state));}
  const backup=JSON.parse(JSON.stringify(await exportShelf(A)));
  ok('backup: format',backup.app==='upwind'&&backup.version===1&&backup.books.length===2&&backup.books[0].meta&&backup.books[0].doc&&backup.books[0].state);

  const B=makeLocal();await B.open();
  const r1=await importShelf(B,backup,[],metaFor);
  ok('restore: adds every book',r1.added===2&&(await B.get('doc:x')).title==='Book x'&&(await B.get('state:x')).hl.length===2);
  const r2=await importShelf(B,backup,await B.all('meta:'),metaFor);
  ok('restore: twice adds nothing',r2.added===0&&r2.merged===0);

  const Cb=makeLocal();await Cb.open();const own=book('x',[{id:'h1',note:'mine'},{id:'h9'}]);
  await Cb.put('doc:x',own.doc);await Cb.put('state:x',own.state);await Cb.put('meta:x',metaFor(own.doc,own.state));
  const r3=await importShelf(Cb,backup,await Cb.all('meta:'),metaFor);const st=await Cb.get('state:x');
  ok('restore: merges missing highlights by id',r3.merged===1&&r3.highlights===1&&st.hl.length===3&&st.hl.find(h=>h.id==='h1').note==='mine');
  ok('restore: updates the shelf entry count',(await Cb.get('meta:x')).hl===3&&r3.added===1);

  let e1='';try{await importShelf(B,{books:[]},[],metaFor);}catch(e){e1=e.message;}
  let e2='';try{await importShelf(B,{app:'upwind',version:2,books:[]},[],metaFor);}catch(e){e2=e.message;}
  ok('restore: rejects other files and newer versions',e1==='not_backup'&&e2==='newer_version');
}

ok('no write errors',errs.length===0);
done();
