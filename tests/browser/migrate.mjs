// Artifact "Back up shelf" → new app "Restore from backup", end to end. Usage: node tests/browser/migrate.mjs [repo dir]
// The artifact runs on 127.0.0.1 and the app on localhost, so they don't share IndexedDB.
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {start,pasteHtml,richPaste} from './lib.mjs';

const t=await start('migrate',8125);
const {ok}=t;

await t.run(async()=>{
  // 1. the artifact, with window.claude.use('downloads') stubbed to capture the saved file
  const a=t.page;
  await a.evaluateOnNewDocument(()=>{window.__saved=null;window.claude={use:async n=>n==='downloads'?{save:async({filename,data})=>{window.__saved={filename,text:typeof data==='string'?data:await data.text()};return {status:'saved'};}}:null};});
  await a.goto(`http://127.0.0.1:${t.port}/legacy/app-artifact.html`,{waitUntil:'networkidle0'});
  await a.waitForSelector('#shelf:not(.hidden)');
  await a.click('#addBtn');await a.waitForSelector('#importM:not(.hidden)');
  await pasteHtml(a,richPaste());
  await a.waitForFunction(()=>document.querySelector('#det').textContent.includes('Ada Rivers'));
  await a.click('#impGo');await t.reader(a);
  await a.evaluate(()=>{const x=document.querySelector('#col p.hp').firstChild;const r=document.createRange();r.setStart(x,0);r.setEnd(x,4);getSelection().removeAllRanges();getSelection().addRange(r);});
  await a.waitForSelector('#tool:not(.hidden)');await a.click('#tool [data-c="coral"]');
  await a.waitForFunction(()=>document.querySelector('#hlCount').textContent==='1');
  await a.click('#bHome');await a.waitForSelector('#shelf:not(.hidden)'); // saves the reading state first
  await a.click('#backupShelf');await a.waitForFunction(()=>window.__saved,{timeout:5000}).catch(()=>{});
  const saved=await a.evaluate(()=>window.__saved);
  const data=saved&&JSON.parse(saved.text);
  ok('artifact backup saved as upwind-backup-*.json',saved&&/^upwind-backup-\d{4}-\d{2}-\d{2}\.json$/.test(saved.filename));
  ok('artifact backup has the book and its highlight',data&&data.app==='upwind'&&data.version===1&&data.books.length===1&&data.books[0].state.hl.length===1&&data.books[0].state.hl[0].color==='coral');
  const file=join(t.tmp,saved.filename);writeFileSync(file,saved.text);

  // 2. the new app in local mode restores it
  const b=await t.newPage();
  await b.goto(t.base,{waitUntil:'networkidle0'});
  await b.waitForSelector('#signin:not(.hidden)');await b.click('#siLocal');await b.waitForSelector('#shelf:not(.hidden)');
  await b.click('#setBtn');await b.waitForSelector('#setM:not(.hidden)');
  await (await b.$('#restoreFile')).uploadFile(file);
  await b.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Restored'),{timeout:5000}).catch(()=>{});
  ok('new app restores the book',(await b.$$('.book')).length===1&&(await t.text('#toast',b)).includes('Restored 1 book'));
  await b.click('.book .cover');await t.reader(b);
  ok('restored highlight shows in the reader',(await b.$$('mark.hl.c-coral')).length>0&&(await t.text('#hlCount',b))==='1');
});
