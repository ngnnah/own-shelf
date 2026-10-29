// Paste from the clipboard without touching a field: the shelf's Paste beside Add (a copied link is added straight
// away, as ?add= does; other text or a picture opens Add with it pasted in), the Add dialog's Paste link chip (fills
// the link field and fetches it for review) and its Paste from clipboard chip, all through one clipboard reader that
// starts inside the tap (iOS). Signed in with a faked Firebase (an in-memory Firestore) and a faked link import
// helper; navigator.clipboard is stubbed. Also the button's place in the shelf toolbar at 320, 390 and 1280 px, and
// local mode. Usage: node tests/browser/paste.mjs [repo dir]
// Screenshots: out/paste-shelf-{320,390,1280}.png, out/paste-dialog-{390,1280}.png.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {start} from './lib.mjs';

const t=await start('paste',8164);
const {ok,must,vis,text,until}=t;
const WORKER=readFileSync(join(t.repo,'config.js'),'utf8').match(/WORKER_URL\s*=\s*"([^"]*)"/)[1].trim().replace(/\/+$/,'');
must('config.js sets the link import helper',!!WORKER);

// The Firebase SDK, faked: signed in as a made-up account unless sessionStorage 'out' is set; Firestore in memory
// (window.__docs, path → data), with snapshots like the real one's.
const FAKE={
  app:'export const initializeApp=c=>({options:c});',
  auth:`const user=sessionStorage.getItem('out')?null:{uid:'u1',email:'reader@example.com',getIdToken:async()=>'test-token'};
export const getAuth=()=>({currentUser:user});export class GoogleAuthProvider{setCustomParameters(){}}
export const getRedirectResult=()=>Promise.resolve(null);
export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb(user));return()=>{};};
export const signInWithPopup=()=>new Promise(()=>{});export const signInWithRedirect=signInWithPopup;export const signOut=()=>Promise.resolve();`,
  firestore:`const docs=window.__docs=new Map(),subs=[];
const snap=p=>({id:p.split('/').pop(),ref:{path:p},exists:()=>docs.has(p),data:()=>docs.has(p)?structuredClone(docs.get(p)):undefined});
const query=p=>{const d=[...docs.keys()].filter(k=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).map(snap);return {empty:!d.length,docs:d,metadata:{fromCache:false}};};
const notify=()=>setTimeout(()=>subs.forEach(s=>s.cb(query(s.path))));
export const initializeFirestore=()=>({}),getFirestore=()=>({}),persistentLocalCache=()=>({}),persistentMultipleTabManager=()=>({});
export const doc=(db,...p)=>({path:p.join('/')}),collection=(db,...p)=>({path:p.join('/')});
export async function setDoc(r,v){docs.set(r.path,structuredClone(v));notify();}
export async function deleteDoc(r){docs.delete(r.path);notify();}
export const getDoc=async r=>snap(r.path),getDocFromCache=async r=>snap(r.path),getDocs=async c=>query(c.path),getDocsFromCache=async c=>query(c.path);
export function onSnapshot(c,cb){const s={path:c.path,cb};subs.push(s);setTimeout(()=>cb(query(c.path)));return()=>{const i=subs.indexOf(s);if(i>=0)subs.splice(i,1);};}`
};
const SDK=/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|firestore)\.js$/;

// In the page, before the app: the clipboard and the link import helper.
// window.__clip: {txt, html, png, refuse, noRead}; refuse makes the read fail as a refused permission does, noRead
// leaves only readText (as in browsers without clipboard.read). Each read logs 'tap' when it started inside a click's
// dispatch, else 'late' (window.__reads). The helper answers a made-up article for any link, titled after its last
// path segment, or {status, error} from window.__worker; each call is logged with its Authorization (window.__fetched).
function fakes(WORKER){
  window.__clip={};window.__reads=[];window.__fetched=[];window.__worker=null;
  let tap=false;
  addEventListener('click',()=>{tap=true;},true);
  addEventListener('click',()=>{tap=false;});
  const png=()=>new Promise(r=>{const c=document.createElement('canvas');c.width=60;c.height=40;const g=c.getContext('2d');g.fillStyle='#2F5A43';g.fillRect(0,0,60,40);c.toBlob(r,'image/png');});
  const refused=()=>Promise.reject(new DOMException('Read permission denied.','NotAllowedError'));
  const read=()=>{
    window.__reads.push(tap?'tap':'late');const c=window.__clip;if(c.refuse) return refused();
    const types=[c.html&&'text/html',c.txt&&'text/plain',c.png&&'image/png'].filter(Boolean);
    return Promise.resolve(types.length?[{types,getType:async ty=>ty==='image/png'?png():new Blob([ty==='text/html'?c.html:c.txt],{type:ty})}]:[]);
  };
  const readText=()=>{window.__reads.push(tap?'tap':'late');const c=window.__clip;return c.refuse?refused():Promise.resolve(c.txt||'');};
  Object.defineProperty(Navigator.prototype,'clipboard',{configurable:true,get:()=>window.__clip.noRead?{readText}:{read,readText,writeText:()=>Promise.resolve()}});
  const real=window.fetch.bind(window);
  window.fetch=async(u,o={})=>{
    const s=String(u);if(!s.startsWith(WORKER+'/?url=')) return real(u,o);
    const link=decodeURIComponent(s.slice(WORKER.length+6));window.__fetched.push({link,auth:(o.headers||{}).Authorization||''});
    const w=window.__worker;
    if(w) return new Response(JSON.stringify({error:w.error}),{status:w.status,headers:{'Content-Type':'application/json'}});
    const title=link.split('/').pop().split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
    const para=n=>`<p>${'The nets are strung between two poles on the ridge, and the fog that rolls in from the sea leaves its water on them. '.repeat(3)} (${n})</p>`;
    const html=`<!doctype html><html><head><title>${title}</title></head><body><header>Site menu</header><article><h1>${title}</h1><p>By Wren Margin</p>${[1,2,3,4,5,6].map(para).join('')}</article><footer>Footer</footer></body></html>`;
    return new Response(html,{status:200,headers:{'Content-Type':'text/html; charset=utf-8','X-Final-URL':link}});
  };
  // the app logs the helper's errors it shows (console.error); drop the fake's, so "no page errors" checks the rest
  const log=console.error;console.error=(...a)=>{if(!(a[0]&&/Synthetic helper error/.test(a[0].message||'')))log(...a);};
}

// A fresh page with the fakes. out: signed out, so the sign-in screen offers local mode.
async function open({out=false}={}){
  await t.page.close();
  const p=t.page=await t.newPage();
  await p.setBypassServiceWorker(true); // so every request reaches the interception below
  await p.setRequestInterception(true);
  p.on('request',r=>{const m=r.url().match(SDK);if(m) return r.respond({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:FAKE[m[1]]});r.continue();});
  await p.evaluateOnNewDocument(fakes,WORKER);
  await p.goto(t.base+'manifest.webmanifest');await p.evaluate(out=>{localStorage.clear();sessionStorage.clear();if(out) sessionStorage.setItem('out','1');},out);
  await p.goto(t.base,{waitUntil:'networkidle0'});
  return p;
}
// A tap on a Paste button, as a DOM click from this script: the script stays on the stack through the click's dispatch,
// so any await before the clipboard read (even of a settled promise) lands after it and logs 'late'. A real mouse click
// runs microtasks between listeners and would miss that.
const tap=sel=>t.page.$eval(sel,e=>e.click());
// Sets the clipboard, and takes down any toast so the next one is the action's.
const clip=c=>t.page.evaluate(c=>{window.__clip=c;const e=document.querySelector('#toast');e.classList.remove('on');e.textContent='';},c);
const lastRead=()=>t.page.evaluate(()=>window.__reads.at(-1));
const fetched=()=>t.page.evaluate(()=>window.__fetched);
const books=()=>t.page.evaluate(()=>[...window.__docs.keys()].filter(k=>/^users\/u1\/books\/[^/]+$/.test(k)).length);
const toastSays=m=>until(m=>{const e=document.querySelector('#toast');return e.classList.contains('on')&&e.textContent===m;},m);
const shown=sel=>t.page.waitForSelector(sel+':not(.hidden)',{timeout:8000}).then(()=>true,()=>false);
const hidden=sel=>until(s=>document.querySelector(s).classList.contains('hidden'),sel);
const value=sel=>t.page.$eval(sel,e=>e.value);
const title=()=>t.page.$eval('.hero h1',e=>[...e.querySelectorAll('.ln')].map(l=>l.textContent).join(' ')); // the reader's title, set in lines
async function home(){if(!(await vis('#shelf'))){await t.page.click('#bHome');await shown('#shelf');}}
// Add focuses its paste box a moment after opening: wait for it, so it can't take the focus from a check's field.
async function openAdd(){await t.page.click('#addBtn');await shown('#importM');must('Add focuses the paste box',await until(()=>document.activeElement.id==='paste'));}
async function cancelAdd(){await t.page.click('#importM [data-cancel]');await until(()=>document.querySelector('#importM').classList.contains('hidden'));}
const rect=sel=>t.page.$eval(sel,e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom,h:r.height};});
const REFUSED='Couldn’t read the clipboard. Paste into the box instead.';
const ARTICLE='<h1>Notes on Harbour Fog</h1><p>By Ada Rivers</p>'+'<p>Morning fog sits low over the harbour, and the boats wait for it to lift before they leave the quay for the day.</p>'.repeat(4);

await t.run(async()=>{
  await open();
  must('signed in (faked): the empty shelf',await shown('#shelf')&&(await text('#shelfBody')).includes('An empty shelf'));

  /* ---------- the button in the shelf toolbar ---------- */
  for(const w of [390,320,1280]){
    await t.page.setViewport({width:w,height:780,deviceScaleFactor:2,isMobile:w<600,hasTouch:w<600});
    await shown('#shelf');
    const a=await rect('#addBtn'),p=await rect('#addPaste');
    const wide=await t.page.evaluate(()=>document.documentElement.scrollWidth);
    ok(`${w} px: Paste sits beside Add, on its row and as tall`,Math.abs(a.t-p.t)<1&&Math.abs(a.h-p.h)<1&&p.l>a.r&&p.l-a.r<20);
    ok(`${w} px: inside the screen, no sideways scroll`,p.r<=w-12&&wide<=w);
    const lbl=await t.page.$eval('#addPaste .lbl',e=>getComputedStyle(e).display!=='none');
    ok(`${w} px: ${w<=360?'an icon only':'the icon and "Paste"'}`,w<=360?!lbl&&Math.abs(p.h-(p.r-p.l))<2:lbl&&(await text('#addPaste')).trim()==='Paste');
    await t.shot(`shelf-${w}`,{clip:{x:0,y:0,width:w,height:w<600?260:120}});
  }
  ok('it has a name and a hint',(await t.page.$eval('#addPaste',e=>[e.getAttribute('aria-label'),e.title].join('|')))==='Paste from clipboard|Paste a copied link or article');
  await t.page.setViewport({width:390,height:844,deviceScaleFactor:2});await shown('#shelf');

  /* ---------- the shelf's Paste: a link is added straight away ---------- */
  await clip({txt:'  https://example.com/fog-nets \n'});
  await tap('#addPaste');await t.reader();
  ok('a copied link: the book is added and opens',(await title()).includes('Fog Nets')&&await books()===1);
  ok('…the clipboard is read inside the tap (iOS)',await lastRead()==='tap');
  const f=await fetched();
  ok('…fetched once through the helper, signed in',f.length===1&&f[0].link==='https://example.com/fog-nets'&&f[0].auth==='Bearer test-token');
  ok('…and the Add dialog is closed',!(await vis('#importM')));
  await home();
  await clip({txt:'https://example.com/fog-nets'});
  await tap('#addPaste');
  ok('the same link again: "Already on your shelf — opening it", as ?add= says',await toastSays('Already on your shelf — opening it'));
  await t.reader();ok('…it opens the book and adds nothing',(await title()).includes('Fog Nets')&&await books()===1);
  await home();

  // the helper fails: the error stays in the dialog, as with ?add=
  await t.page.evaluate(()=>{window.__worker={status:502,error:'Synthetic helper error 502.'};});
  await clip({txt:'https://example.com/tide-tables'});
  await tap('#addPaste');
  await until(()=>document.querySelector('#impErr').textContent.includes('Synthetic'));
  ok('a link the helper can’t fetch: the dialog shows its error and the link',await vis('#importM')&&(await text('#impErr'))==='Synthetic helper error 502.'&&await value('#link')==='https://example.com/tide-tables');
  ok('…and nothing is added',await books()===1);
  await t.page.evaluate(()=>{window.__worker=null;});
  await cancelAdd();

  /* ---------- the shelf's Paste: text or a picture opens Add with it ---------- */
  // a draft left in Add (a tap outside keeps it): Paste starts fresh, as a deep link does
  await openAdd();
  await t.page.$eval('#link',e=>{e.value='https://example.com/old-draft';});
  must('the top left corner is the backdrop',await t.page.evaluate(()=>document.elementFromPoint(6,6).classList.contains('modal')));
  await t.page.mouse.click(6,6);must('a tap outside keeps the draft',await hidden('#importM'));
  await clip({html:ARTICLE,txt:'Notes on Harbour Fog'});
  const calls=(await fetched()).length;
  await tap('#addPaste');
  await until(()=>document.querySelector('#det').textContent.includes('Harbour Fog'));
  ok('copied text: Add opens with it pasted in and its title found',await vis('#importM')&&(await text('#paste')).includes('Morning fog sits low')&&(await text('#det')).includes('Notes on Harbour Fog'));
  ok('…in a fresh dialog, not the earlier draft',await value('#link')==='');
  ok('…nothing fetched, nothing added',(await fetched()).length===calls&&await books()===1);
  await t.shot('dialog-390');
  await t.page.click('#impGo');await t.reader();
  ok('…and Add and start reading adds it',(await title()).includes('Harbour Fog')&&await books()===2);
  await home();

  await clip({png:true});
  await tap('#addPaste');
  ok('a copied picture: Add opens with it in the box',await shown('#importM')&&await until(()=>!!document.querySelector('#paste img')));
  await cancelAdd();

  // readText only (no clipboard.read): a link still goes straight to the shelf
  await clip({txt:'https://example.com/salt-roads',noRead:true});
  await tap('#addPaste');await t.reader();
  ok('without clipboard.read, readText still adds a link',(await title()).includes('Salt Roads')&&await books()===3&&await lastRead()==='tap');
  await home();

  /* ---------- the shelf's Paste: empty, refused ---------- */
  await clip({});
  await tap('#addPaste');
  ok('an empty clipboard: "The clipboard is empty", and Add stays closed',await toastSays('The clipboard is empty')&&!(await vis('#importM')));
  await clip({refuse:true});
  await tap('#addPaste');
  ok('a refused read: Add opens with the box focused to paste into',await shown('#importM')&&await until(()=>document.activeElement.id==='paste'));
  ok('…with the existing message',await toastSays(REFUSED));
  await cancelAdd();

  /* ---------- the Add dialog's Paste link chip: fills the field and fetches it for review ---------- */
  await openAdd();
  ok('Add has a Paste link chip at the link field',await vis('#linkPaste')&&(await text('#linkPaste'))==='Paste link');
  await clip({txt:'https://example.com/lantern-keepers'});
  await tap('#linkPaste');
  await until(()=>document.querySelector('#det').textContent.includes('Lantern Keepers'));
  ok('Paste link: the link fills the field and its article is found for review',await value('#link')==='https://example.com/lantern-keepers'&&(await text('#det')).includes('Lantern Keepers'));
  ok('…read inside the tap, and nothing added: the dialog stays open',await lastRead()==='tap'&&await vis('#importM')&&await books()===3);
  await t.page.click('#impGo');await t.reader();
  ok('…until Add and start reading',(await title()).includes('Lantern Keepers')&&await books()===4);
  await home();

  await openAdd();
  await clip({txt:'Read this one: https://example.com/quay-walls.'});
  await tap('#linkPaste');
  await until(()=>document.querySelector('#det').textContent.includes('Quay Walls'));
  ok('Paste link takes the link out of shared text',await value('#link')==='https://example.com/quay-walls');
  await cancelAdd();
  await openAdd();
  await t.page.$eval('#link',e=>{e.value='https://example.com/typed';});
  await clip({txt:'No link in this text at all.'});
  await tap('#linkPaste');
  await until(()=>!document.querySelector('#impErr').classList.contains('hidden'));
  ok('Paste link with no link: the field’s error, and the typed link stays',(await text('#impErr'))==='That doesn’t look like a web link.'&&await value('#link')==='https://example.com/typed');
  await clip({});
  await tap('#linkPaste');
  ok('Paste link with an empty clipboard: "The clipboard is empty"',await toastSays('The clipboard is empty'));
  await clip({refuse:true});
  await tap('#linkPaste');
  ok('Paste link refused: the link field is focused to paste into',await toastSays('Couldn’t read the clipboard. Paste the link into the field instead.')&&await until(()=>document.activeElement.id==='link'));
  await cancelAdd();

  /* ---------- Paste from clipboard, as before (now through the same reader) ---------- */
  await openAdd();
  await clip({txt:'https://example.com/net-menders'});
  await tap('#pasteBtn');
  await until(()=>document.querySelector('#det').textContent.includes('Net Menders'));
  ok('Paste from clipboard: a lone link imports for review, not added',await value('#link')==='https://example.com/net-menders'&&await vis('#importM')&&await books()===4&&await lastRead()==='tap');
  await cancelAdd();
  await openAdd();
  await clip({html:ARTICLE,txt:'x'});
  await tap('#pasteBtn');
  ok('Paste from clipboard: text goes into the box',await until(()=>document.querySelector('#paste').textContent.includes('Morning fog sits low')));
  await clip({refuse:true});
  await tap('#pasteBtn');
  ok('Paste from clipboard refused: the same message, the box focused',await toastSays(REFUSED)&&await until(()=>document.activeElement.id==='paste'));
  await cancelAdd();

  await t.page.setViewport({width:1280,height:800,deviceScaleFactor:1});await shown('#shelf');
  await openAdd();
  const lp=await rect('#linkPaste'),li=await rect('#link');
  ok('1280 px: the Paste link chip sits just above the link field',lp.b<=li.t&&li.t-lp.b<30);
  await t.shot('dialog-1280');
  await cancelAdd();

  /* ---------- local mode: a link explains that link import needs sign-in, as ?add= does ---------- */
  await open({out:true});
  must('signed out: the sign-in screen',await shown('#signin'));
  await t.page.click('#siLocal');must('local mode',await shown('#shelf'));
  await clip({txt:'https://example.com/fog-nets'});
  await tap('#addPaste');
  await until(()=>!document.querySelector('#impErr').classList.contains('hidden'));
  ok('local mode: a copied link opens Add with it and says sign-in is needed',await vis('#importM')&&await value('#link')==='https://example.com/fog-nets'&&(await text('#impErr')).includes('sign-in')&&(await fetched()).length===0);
});
