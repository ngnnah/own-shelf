// Shared helpers for the browser tests (see run.mjs for what the suite covers and how to run it):
// a static server per test file, headless Chrome, PASS/FAIL reporting, page helpers and the setup steps
// several files share. A step takes a `check` function: t.ok in the file that tests that step
// (each check counts), t.must in files that only need the state (a failed step stops the file).
import puppeteer from 'puppeteer-core';
import {spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
export const repo=resolve(process.argv[2]||join(here,'..','..'));
const out=join(here,'out');
const CHROME=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// python3 -m http.server on 127.0.0.1:port. Resolves once it listens; rejects if it exits first (port taken).
function serve(port){
  const srv=spawn('python3',['-u','-m','http.server',String(port),'--bind','127.0.0.1','--directory',repo],{stdio:['ignore','pipe','ignore']});
  process.on('exit',()=>srv.kill());
  return new Promise((res,rej)=>{
    let buf='';srv.stdout.on('data',d=>{buf+=d;if(buf.includes('Serving HTTP'))res(srv);});
    srv.on('error',rej);srv.on('exit',code=>rej(new Error(`http.server on port ${port} exited with ${code}; is the port in use?`)));
  });
}

// Wait until a file matching re appears in dir (a finished download, not a .crdownload).
export async function waitForFile(dir,re,ms=5000){
  for(const end=Date.now()+ms;Date.now()<end;await sleep(50)){const f=readdirSync(dir).find(n=>re.test(n));if(f)return f;}
  return null;
}

// Start the server and Chrome for one test file. Returns the test context `t`.
// TEST_PORT_OFFSET shifts every file's port, so two checkouts can run the suite at the same time.
export async function start(name,port){
  port+=Number(process.env.TEST_PORT_OFFSET||0);
  const srv=await serve(port);
  let browser;
  try{browser=await puppeteer.launch({executablePath:CHROME,headless:true,args:['--no-first-run']});}
  catch(e){srv.kill();throw e;}
  mkdirSync(out,{recursive:true});
  const tmp=mkdtempSync(join(tmpdir(),'own-shelf-test-')),dl=join(tmp,'downloads');mkdirSync(dl);
  const errors=[];let passed=0,failed=0;
  const t={
    name,port,repo,tmp,dl,browser,base:`http://localhost:${port}/`,
    ok(label,cond){cond?passed++:failed++;console.log(cond?'PASS':'FAIL',label);},
    must(label,cond){if(!cond)throw new Error('setup step failed: '+label);},
    async newPage(){
      const p=await browser.newPage();await p.setViewport({width:390,height:844,deviceScaleFactor:2});
      p.on('pageerror',e=>errors.push('pageerror: '+e.message));
      p.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
      return p;
    },
    vis:(sel,p=t.page)=>p.$eval(sel,e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none').catch(()=>false),
    text:(sel,p=t.page)=>p.$eval(sel,e=>e.textContent),
    // Wait up to 5 s for fn (run in the page) to be truthy. Never throws: the check that follows reports.
    until:(fn,...args)=>t.page.waitForFunction(fn,{timeout:5000},...args).then(()=>true,()=>false),
    // Run action, then wait until sel's content changes (e.g. a debounced or async re-render).
    async afterChange(sel,action){
      await t.page.$eval(sel,e=>{e.__changed=false;new MutationObserver((_,o)=>{e.__changed=true;o.disconnect();}).observe(e,{childList:true,characterData:true,subtree:true});});
      await action();
      return t.until(s=>document.querySelector(s).__changed,sel);
    },
    // openBook shows the reader, then scrolls in a requestAnimationFrame: wait for both.
    async reader(p=t.page){
      await p.waitForSelector('#reader:not(.hidden)');
      await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    },
    // Select from the start of one element to the end of another, then wait for the highlight toolbar.
    async select(from,to=from){
      await t.page.evaluate((a,b)=>{const s=document.querySelector(a),e=document.querySelector(b);const r=document.createRange();r.setStart(s.firstChild||s,0);const x=e.lastChild||e;r.setEnd(x,x.nodeType===3?x.length:x.childNodes.length);getSelection().removeAllRanges();getSelection().addRange(r);},from,to);
      await t.until(()=>!document.querySelector('#tool').classList.contains('hidden'));
    },
    // Drawers slide for 0.3 s. A closing one is full width at phone size and catches clicks until it is
    // hidden, and clicks on an opening one can miss while it moves: wait for both to finish.
    async openDrawer(button,id){
      await t.page.click(button);
      await t.page.waitForFunction(id=>{const d=document.querySelector(id);return d.classList.contains('open')&&!d.getAnimations().length;},{},id);
    },
    drawersGone:()=>t.page.waitForFunction(()=>[...document.querySelectorAll('.drawer')].every(d=>getComputedStyle(d).visibility==='hidden')),
    async closeDrawer(){await t.page.keyboard.press('Escape');await t.drawersGone();},
    shot:(label,opts={})=>t.page.screenshot({path:join(out,`${name}-${label}.png`),...opts}),
    // Run the test body, then report page errors, clean up and set the exit code.
    async run(body){
      try{await body();}catch(e){failed++;console.log('FAIL exception',e.message);}
      const real=errors.filter(e=>!/ERR_INTERNET_DISCONNECTED|Failed to load resource|net::ERR/.test(e));
      t.ok('no page errors',real.length===0);if(real.length)console.log(real.join('\n'));
      await browser.close();srv.kill();rmSync(tmp,{recursive:true,force:true});
      console.log(failed?`${failed} of ${passed+failed} failed`:`all ${passed} passed`);
      process.exitCode=failed?1:0;
    }
  };
  t.page=await t.newPage();
  const cdp=await t.page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dl});
  return t;
}

/* ---------- setup steps shared by several files ---------- */

// Paste HTML into the import dialog's paste box, as the clipboard would.
export const pasteHtml=(page,html,text)=>page.evaluate((html,text)=>{const dt=new DataTransfer();dt.setData('text/html',html);if(text)dt.setData('text/plain',text);document.querySelector('#paste').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},html,text);
export const richPaste=()=>readFileSync(join(repo,'legacy/test-fixture-rich-paste.html'),'utf8');

// First visit: the sign-in screen, then "this device only".
export async function enterLocalMode(t,check=t.ok){
  const {page}=t;
  await page.goto(t.base,{waitUntil:'networkidle0'});
  await page.waitForSelector('#signin:not(.hidden)',{timeout:15000});
  check('sign-in screen first',await t.vis('#signin'));
  check('Google button shown (Firebase loaded)',await t.vis('#siGoogle'));
  await t.shot('signin');
  await page.click('#siLocal');await page.waitForSelector('#shelf:not(.hidden)');
  check('local mode opens the empty shelf',(await t.text('#shelfBody')).includes('An empty shelf'));
}

// "The Quiet Engine" by Ada Rivers, from the rich-paste fixture. Opens it in the reader.
export async function addQuietEngine(t,check=t.ok){
  const {page}=t;
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  await pasteHtml(page,richPaste(),'x');
  await t.until(()=>document.querySelector('#det').textContent.includes('Ada Rivers'));
  const det=await t.text('#det');
  check('paste detects title and author',det.includes('The Quiet Engine')&&det.includes('Ada Rivers'));
  await t.shot('import');
  await page.click('#impGo');await t.reader();
  check('reader opens with the title',(await t.text('.hero h1')).includes('Quiet'));
  check('nested list items rendered',(await page.$$('.list .li')).length>=5);
}

const hlCount=(t,n)=>t.until(n=>document.querySelector('#hlCount').textContent===n,n);

// Two mint highlights in the open Quiet Engine: one paragraph (toolbar), then two list items (key 2).
export async function highlightQuietEngine(t,check=t.ok){
  const {page}=t;
  await t.select('#col p.hp');
  check('toolbar appears on selection',await t.vis('#tool'));
  await page.click('#tool [data-c="mint"]');await hlCount(t,'1');
  check('highlight created',(await page.$$('mark.hl.c-mint')).length>0&&(await t.text('#hlCount'))==='1');
  await t.select('.list .li:nth-child(1)','.list .li:nth-child(2)');
  await page.keyboard.press('2');await hlCount(t,'2');
  check('highlight across two list items',(await t.text('#hlCount'))==='2'&&(await page.$$('.list .li mark.hl')).length>=2);
}

// Write a Markdown file to the temp dir, add it from the shelf through the file picker and open it.
export async function addMarkdown(t,file,md,title){
  const {page}=t;const path=join(t.tmp,file);writeFileSync(path,md);
  if(!(await t.vis('#shelf'))){await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');}
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  await (await page.$('#file')).uploadFile(path);
  await t.until(title=>document.querySelector('#det').textContent.includes(title),title);
  await page.click('#impGo');await t.reader();
}

// "Footnote Test": a Markdown file with a footnote; one sunny highlight on the footnote's text.
export async function addFootnoteBook(t,check=t.ok){
  const {page}=t;
  await addMarkdown(t,'notes-test.md','# Footnote Test\n\nBy Sam Tester\n\n'+'A sentence that needs a source [1]. '.repeat(3)+'\n\n'+'Filler words for the body of the text. '.repeat(30)+'\n\n'+'More filler words for the body. '.repeat(30)+'\n\nNotes\n\n[1] The source of the claim, which is a note.\n','Footnote Test');
  check('footnote markers rendered',(await page.$$('.fn')).length>=1);
  await page.click('.fn');
  check('footnote card opens',await t.vis('.fn-card'));
  await t.select('.fn-card .hp');
  check('footnote text is selectable for highlighting',await t.vis('#tool'));
  await page.click('#tool [data-c="sun"]');await hlCount(t,'1');
  check('footnote highlight saved',(await t.text('#hlCount'))==='1');
}

/* ---------- the study log: settings:app's studyLog, { 'YYYY-MM-DD': { reviews, new } } by local date ---------- */
export const dayKey=(t=Date.now())=>{const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
// settings:app as the local store (IndexedDB "upwind", store "kv") holds it now
export const readSettings=page=>page.evaluate(()=>new Promise((res,rej)=>{
  const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get('settings:app');g.onsuccess=()=>{r.result.close();res(g.result);};g.onerror=()=>rej(g.error);};
}));
// Replaces the stored study log, keeping the other settings. The app reads it when it loads and when Study opens; leave
// Study first (Back), or the app writes its own copy over this one when the page reloads.
export const setStudyLog=(page,log)=>page.evaluate(log=>new Promise((res,rej)=>{
  const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite'),s=tx.objectStore('kv'),g=s.get('settings:app');
    g.onsuccess=()=>s.put({...(g.result||{}),studyLog:log},'settings:app');tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};
}),log);
