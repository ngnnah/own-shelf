// The local-only flow end to end. Usage: node tests/browser/smoke.mjs [repo dir]
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {start,waitForFile,enterLocalMode,addQuietEngine,highlightQuietEngine,addFootnoteBook} from './lib.mjs';

const t=await start('smoke',8121);
const {page,ok,vis,text,until}=t;

await t.run(async()=>{
  await enterLocalMode(t);
  await addQuietEngine(t);
  await highlightQuietEngine(t);
  await addFootnoteBook(t);

  // export the open book in all three formats
  await t.openDrawer('#bHl','#drawer');await page.click('#expBook');await page.waitForSelector('#expM:not(.hidden)');
  for(const f of ['md','html','txt']){
    await t.afterChange('#expPrev',()=>page.click(`#expFmt [data-f="${f}"]`));
    ok(`export preview (${f})`,(await text('#expPrev')).includes('source of the claim'));
    await page.click('#expDl');await waitForFile(t.dl,new RegExp(`^footnote-test-notes\\.${f}$`));
  }
  const files=readdirSync(t.dl);
  ok('export downloads all formats',['md','html','txt'].every(x=>files.some(n=>n.startsWith('footnote-test-notes.')&&n.endsWith('.'+x))));
  await page.keyboard.press('Escape');await t.drawersGone(); // the export dialog closed the drawer

  // reload keeps local mode and data
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden)',{timeout:10000});
  await until(()=>document.querySelectorAll('.book').length===2);
  ok('reload keeps local mode and both books',(await page.$$('.book')).length===2);

  // settings, backup, restore
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  ok('settings show local account',(await text('#acct'))==='On this device only'&&!(await vis('#signOut')));
  await t.shot('settings');
  await page.click('#backupBtn');
  const bk=await waitForFile(t.dl,/^upwind-backup-.*\.json$/);
  const data=bk&&JSON.parse(readFileSync(join(t.dl,bk),'utf8'));
  ok('backup file has both books with highlights',data&&data.app==='upwind'&&data.books.length===2&&data.books.reduce((a,b)=>a+b.state.hl.length,0)===3);
  await (await page.$('#restoreFile')).uploadFile(join(t.dl,bk));
  await until(()=>document.querySelector('#toast').textContent.includes('already here'));
  ok('restoring the same backup changes nothing',(await text('#toast')).includes('already here'));

  // deep link in local mode explains sign-in is needed
  await page.goto(t.base+'?add='+encodeURIComponent('https://example.com/post'),{waitUntil:'networkidle0'});
  await until(()=>document.querySelector('#impErr').textContent.includes('sign-in'));
  ok('deep link opens the import dialog with the link',await vis('#importM')&&(await page.$eval('#link',e=>e.value))==='https://example.com/post');
  ok('deep link explains sign-in is needed',(await text('#impErr')).includes('sign-in'));
  ok('deep link cleaned from the address bar',!page.url().includes('add='));
  await page.keyboard.press('Escape');

  // offline reload through the service worker
  await page.reload({waitUntil:'networkidle0'});
  await until(()=>!!navigator.serviceWorker.controller);
  ok('service worker controls the page',await page.evaluate(()=>!!navigator.serviceWorker.controller));
  await page.setOfflineMode(true);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#shelf:not(.hidden)',{timeout:10000}).catch(()=>{});
  await until(()=>document.querySelectorAll('.book').length===2);
  ok('offline reload still shows the shelf',(await page.$$('.book')).length===2);
  await page.click('.book .cover');await page.waitForSelector('#reader:not(.hidden)',{timeout:5000}).catch(()=>{});
  ok('offline: a book still opens',await vis('#reader'));
  await page.setOfflineMode(false);
});
