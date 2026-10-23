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

// cloud: the trash (deleted books, highlights and notes)
{
  const F=fakeFirestore();const C=makeCloud(F.fs,{},'u1',{onError:e=>errs.push(e),delay:10000});
  await C.put('trash:t1',{id:'t1',kind:'highlights',bookId:'a',deletedAt:1,items:[{id:'h1',segs:[{pid:'b0',s:0,e:4}],note:undefined}]});
  ok('cloud: trash entries are written straight away',F.writes()===1&&F.docs.get('users/u1/trash/t1').items[0].id==='h1');
  await C.put('trash:t2',{id:'t2',kind:'book',bookId:'b',deletedAt:2});
  const list=await C.all('trash:');
  ok('cloud: all("trash:") lists the trash',list.length===2&&list.some(x=>x.kind==='book'));
  ok('cloud: get reads one trash entry',(await C.get('trash:t2')).bookId==='b');
  await C.del('trash:t1');
  ok('cloud: del removes a trash entry',!F.docs.has('users/u1/trash/t1')&&(await C.all('trash:')).length===1);
  await C.put('meta:q',{id:'q',title:'Queued'});
  ok('cloud: all("meta:") includes queued shelf entries',(await C.all('meta:')).some(m=>m.id==='q'));
  ok('cloud: unknown prefixes list nothing',(await C.all('doc:')).length===0);
  await C.flush();
}
// local: the trash uses the same keys
{
  const L=makeLocal();await L.open();
  await L.put('trash:t1',{id:'t1'});await L.put('meta:a',{id:'a'});
  ok('local: all("trash:") lists only the trash',(await L.all('trash:')).length===1);
}

// words (vocabulary): stored under users/{uid}/words, coalesced like reading state, in backups
{
  const F=fakeFirestore();const C=makeCloud(F.fs,{},'u1',{onError:e=>errs.push(e),delay:10000});
  const w={id:'w1',term:'ephemeral',def:'',examples:[{text:'Its calm was ephemeral.',s:13,e:22,bookId:'a',pid:'b0',ws:13,we:22,title:'A',at:1}],added:1,srs:{due:1,interval:0,ease:2.5,reps:0,lapses:0}};
  for(let i=0;i<5;i++) await C.put('word:w1',{...w,srs:{...w.srs,reps:i}});
  ok('cloud: word updates are coalesced',F.writes()===0&&(await C.get('word:w1')).srs.reps===4);
  await C.flush();
  ok('cloud: words live under users/{uid}/words',F.writes()===1&&F.docs.get('users/u1/words/w1').term==='ephemeral');
  ok('cloud: all("word:") lists the words',(await C.all('word:')).length===1);
  await C.del('word:w1');ok('cloud: del removes a word',!F.docs.has('users/u1/words/w1'));
}
{
  const metaFor=(d,s)=>({id:d.id,title:d.title,hl:(s.hl||[]).length});
  const A=makeLocal();await A.open();
  await A.put('doc:x',{id:'x',title:'X',blocks:[{t:'p',id:'b0',text:'hi'}],sections:[]});await A.put('state:x',{hl:[]});await A.put('meta:x',{id:'x',title:'X',hl:0});
  const ex=(pid,ws)=>({text:'s',s:0,e:1,bookId:'x',pid,ws,we:ws+1,title:'X',at:1});
  await A.put('word:w1',{id:'w1',term:'calm',def:'still',examples:[ex('b0',0)],added:1});
  const bk=JSON.parse(JSON.stringify(await exportShelf(A)));
  ok('backup: includes the words',Array.isArray(bk.words)&&bk.words.length===1&&bk.words[0].term==='calm');
  const B=makeLocal();await B.open();
  await B.put('word:w1',{id:'w1',term:'calm',def:'',examples:[ex('b9',4)],added:2,srs:{reps:3}});
  const r=await importShelf(B,bk,[],metaFor),w=await B.get('word:w1');
  ok('restore: merges a known word\'s examples, keeps its schedule, fills a missing meaning',r.words===1&&w.examples.length===2&&w.srs.reps===3&&w.def==='still');
  const r2=await importShelf(B,bk,await B.all('meta:'),metaFor);
  ok('restore: the same words again change nothing',r2.words===0&&(await B.get('word:w1')).examples.length===2);
  // fact cards live with the words: backed up, restored when missing, a newer copy kept
  const f={id:'fabc',kind:'fact',text:'Ink fades.',blank:{s:4,e:9},note:'',bookId:'x',hlId:'h1',pid:'b0',ws:0,we:10,title:'X',added:3};
  await A.put('word:fabc',f);
  const bk2=JSON.parse(JSON.stringify(await exportShelf(A))),C=makeLocal();await C.open();
  const r3=await importShelf(C,bk2,[],metaFor),fc=await C.get('word:fabc');
  ok('restore: a fact card comes back whole',r3.words===2&&fc&&fc.kind==='fact'&&fc.blank.e===9&&fc.text==='Ink fades.');
  await C.put('word:fabc',{...f,srs:{reps:2}});
  const r4=await importShelf(C,bk2,await C.all('meta:'),metaFor);
  ok('restore: a fact card already here is left alone',r4.words===0&&(await C.get('word:fabc')).srs.reps===2);
  // pictures, synonyms, antonyms and dictionary examples: a word already here keeps its own and gets only the missing ones
  const pic={src:'data:image/jpeg;base64,AAAA',credit:{title:'Calm',url:'https://en.wikipedia.org/wiki/Calm'}};
  await A.put('word:w1',{...(await A.get('word:w1')),syn:['still','quiet'],ant:['stormy'],dex:[{text:'A calm sea.',s:2,e:6,cite:'1850, Ann Example'}],pics:[pic],tried:{wiki:'calm',muse:'calm',wikt:'calm'}});
  await A.put('word:fabc',{...f,pics:[pic],tried:{wiki:'fades'}});
  const bk3=JSON.parse(JSON.stringify(await exportShelf(A)));
  ok('backup: includes pictures, synonyms, antonyms and examples',bk3.words.find(x=>x.id==='w1').pics[0].src===pic.src&&bk3.words.find(x=>x.id==='w1').dex.length===1);
  const D=makeLocal();await D.open();
  await D.put('word:w1',{id:'w1',term:'calm',def:'my own',examples:[ex('b0',0)],syn:['tranquil'],tried:{muse:'calm'},srs:{reps:5}});
  await D.put('word:fabc',{...f,srs:{reps:1}});
  const r5=await importShelf(D,bk3,[],metaFor),dw=await D.get('word:w1'),df=await D.get('word:fabc');
  ok('restore: a known word keeps its fields and gets the missing pictures, antonyms and examples',r5.words===2&&dw.def==='my own'&&dw.srs.reps===5&&dw.syn.join()==='tranquil'
    &&dw.ant.join()==='stormy'&&dw.pics[0].src===pic.src&&dw.dex[0].cite==='1850, Ann Example'&&dw.examples.length===1&&dw.tried.muse==='calm'&&dw.tried.wiki==='calm');
  ok('restore: a known fact card gets its missing picture, keeps its schedule',df.pics.length===1&&df.srs.reps===1&&df.text==='Ink fades.');
  const r6=await importShelf(D,bk3,[],metaFor);
  ok('restore: the same again changes nothing',r6.words===0);
}

// shelves (categories): the list in backups, each book's shelf on its reading state and shelf entry
{
  const metaFor=(d,s)=>({id:d.id,title:d.title,shelf:s.shelf||'',hl:(s.hl||[]).length});
  const DEF=[{id:'travel',name:'Travel'},{id:'history',name:'History'},{id:'finance',name:'Finance'}];
  const mine=[{id:'history',name:'Old times'},{id:'s1',name:'Poetry'}];
  const A=makeLocal();await A.open();
  for(const [id,shelf] of [['x','s1'],['y','history'],['z','']]){const d={id,title:'Book '+id,blocks:[{t:'p',id:'b0',text:'hi'}],sections:[]},st={hl:[],shelf};await A.put('doc:'+id,d);await A.put('state:'+id,st);await A.put('meta:'+id,metaFor(d,st));}
  const bk=JSON.parse(JSON.stringify(await exportShelf(A,null,mine)));
  ok('backup: carries the shelf list and each book\'s shelf (in its state)',bk.version===1&&bk.shelves.length===2&&bk.shelves[1].name==='Poetry'&&bk.books.find(b=>b.doc.id==='x').state.shelf==='s1'&&!('shelf' in bk.books[0].doc));
  ok('backup: no list given, no shelves field',!('shelves' in JSON.parse(JSON.stringify(await exportShelf(A)))));

  // a shelf that was never arranged takes the backup's list, then those of its own shelves the backup lacks that hold books
  const B=makeLocal();await B.open();await B.put('settings:app',{workerUrl:'https://w.example'});
  const w={id:'w',title:'Book w',blocks:[{t:'p',id:'b0',text:'hi'}],sections:[]};await B.put('doc:w',w);await B.put('state:w',{hl:[],shelf:'finance'});await B.put('meta:w',metaFor(w,{shelf:'finance'}));
  const r1=await importShelf(B,bk,await B.all('meta:'),metaFor,DEF),sb=await B.get('settings:app');
  ok('restore: an unarranged shelf takes the backup\'s names and order, plus its own shelves that hold books',r1.shelves.map(s=>s.name).join()==='Old times,Poetry,Finance'&&sb.shelves.map(s=>s.id).join()==='history,s1,finance');
  ok('restore: other settings stay',sb.workerUrl==='https://w.example');
  ok('restore: books come back on their shelves',(await B.get('state:x')).shelf==='s1'&&(await B.get('meta:x')).shelf==='s1'&&(await B.get('meta:y')).shelf==='history'&&(await B.get('meta:z')).shelf==='');
  const r2=await importShelf(B,bk,await B.all('meta:'),metaFor,(await B.get('settings:app')).shelves);
  ok('restore: twice changes no shelves',!r2.shelves&&(await B.get('settings:app')).shelves.length===3);

  // an arranged shelf keeps its own names and order; the backup's new shelves join at the end
  const C=makeLocal();await C.open();const own=[{id:'s9',name:'Cooking'},{id:'history',name:'History'}];
  await C.put('settings:app',{shelves:own});
  const d0={id:'y',title:'Book y',blocks:[{t:'p',id:'b0',text:'hi'}],sections:[]};await C.put('doc:y',d0);await C.put('state:y',{hl:[],shelf:'s9'});await C.put('meta:y',metaFor(d0,{shelf:'s9'}));
  const r3=await importShelf(C,bk,await C.all('meta:'),metaFor,own);
  ok('restore: an arranged shelf keeps its names and order, adds missing shelves at the end',r3.shelves.map(s=>s.name).join()==='Cooking,History,Poetry'&&(await C.get('settings:app')).shelves.length===3);
  ok('restore: a book already here stays on its own shelf',(await C.get('state:y')).shelf==='s9'&&(await C.get('meta:y')).shelf==='s9');
  // a book already here that gets the backup's missing highlights keeps its own shelf too
  const bh=JSON.parse(JSON.stringify(bk));bh.books.find(b=>b.doc.id==='y').state.hl=[{id:'h1'}];
  const r5=await importShelf(C,bh,await C.all('meta:'),metaFor,own);
  ok('restore: merging highlights keeps the book\'s shelf',r5.merged===1&&(await C.get('state:y')).shelf==='s9'&&(await C.get('state:y')).hl.length===1&&(await C.get('meta:y')).shelf==='s9');

  // old backups (no list) still restore, and leave the shelves alone
  const old=JSON.parse(JSON.stringify(bk));delete old.shelves;old.books.forEach(b=>delete b.state.shelf);
  const D=makeLocal();await D.open();
  const r4=await importShelf(D,old,[],metaFor,DEF);
  ok('restore: an old backup adds its books unsorted and writes no shelves',r4.added===3&&!r4.shelves&&!(await D.get('settings:app'))&&(await D.get('meta:x')).shelf==='');
  // a broken list entry is skipped
  const bad=JSON.parse(JSON.stringify(bk));bad.shelves.push(null,{id:'',name:'x'},{name:'No id'});
  const E=makeLocal();await E.open();
  ok('restore: skips shelves without an id or name',(await importShelf(E,bad,[],metaFor,[])).shelves.length===2);
}
// cloud: a backup's shelves restore into settings/app, which Firestore takes (no arrays in arrays)
{
  const F=fakeFirestore();const C=makeCloud(F.fs,{},'u1',{onError:e=>errs.push(e),delay:10000});
  const metaFor=(d,s)=>({id:d.id,title:d.title,shelf:s.shelf||'',hl:(s.hl||[]).length});
  const bk={app:'upwind',version:1,books:[{meta:{id:'x'},doc:{id:'x',title:'X',blocks:[{t:'p',id:'b0',text:'hi'}],sections:[]},state:{hl:[],shelf:'s1'}}],shelves:[{id:'s1',name:'Poetry'}]};
  const r=await importShelf(C,bk,[],metaFor,[{id:'travel',name:'Travel'}]);await C.flush();
  ok('cloud: restored shelves land in settings/app, a book\'s shelf in its state',r.shelves.length===1&&F.docs.get('users/u1/settings/app').shelves[0].name==='Poetry'&&F.docs.get('users/u1/state/x').shelf==='s1'&&F.docs.get('users/u1/meta/x').shelf==='s1');
}

ok('no write errors',errs.length===0);
done();
