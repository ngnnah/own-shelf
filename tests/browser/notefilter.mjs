// The "With note" filter chip in the highlights drawer. Usage: node tests/browser/notefilter.mjs [repo dir]
import {start,enterLocalMode,addQuietEngine,highlightQuietEngine} from './lib.mjs';

const t=await start('notefilter',8124);
const {page,ok,must,vis,text,until}=t;

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addQuietEngine(t,must);
  await highlightQuietEngine(t,must); // 2 highlights, no notes

  const chipText=f=>page.$eval(`#drFilters [data-f="${f}"]`,e=>e.textContent.trim()).catch(()=>null);
  const pressed=f=>page.$eval(`#drFilters [data-f="${f}"]`,e=>e.getAttribute('aria-pressed')).catch(()=>null);
  const cards=()=>page.$$eval('#drList .hcard',els=>els.length);
  await t.openDrawer('#bHl','#drawer');
  ok('no "With note" chip before any note',(await chipText('noted'))===null);
  await t.closeDrawer();

  await page.click('mark.hl.c-mint');await until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  ok('tapping a highlight shows the toolbar with Note',await vis('#tool')&&(await text('#tool [data-a="note"]'))==='Note');
  await page.click('#tool [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  await page.type('#noteTa','A synthetic note');await page.click('#noteSave');
  ok('note saved on the existing highlight',(await text('#toast')).includes('Note saved')&&(await text('#hlCount'))==='2');

  await t.openDrawer('#bHl','#drawer');
  ok('drawer shows "With note 1" right after All',(await chipText('noted'))==='With note 1'&&(await page.$$eval('#drFilters .chip',els=>els.map(e=>e.dataset.f))).slice(0,2).join()==='all,noted');
  await page.click('#drFilters [data-f="noted"]');
  ok('tapping it shows exactly 1 card',(await cards())===1&&(await pressed('noted'))==='true'&&(await text('#drList .hcard .nt'))==='A synthetic note');
  await t.shot('drawer');

  await page.click('#drList .hcard [data-a="note"]');await page.waitForSelector('#noteBox:not(.hidden)');
  ok('card offers Edit note with the text',(await page.$eval('#noteTa',e=>e.value))==='A synthetic note');
  await page.$eval('#noteTa',e=>{e.value='';});await page.click('#noteSave');
  ok('note cleared',(await text('#toast')).includes('Moved to Trash'));
  ok('drawer still open after clearing',await page.$eval('#drawer',e=>e.classList.contains('open')));
  ok('"With note" chip disappears',(await chipText('noted'))===null);
  ok('drawer falls back to All with 2 cards',(await pressed('all'))==='true'&&(await cards())===2);
  await t.closeDrawer();
});
