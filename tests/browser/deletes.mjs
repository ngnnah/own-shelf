// Deletes that lose highlights or notes ask for "yes" typed in a dialog. Usage: node tests/browser/deletes.mjs [repo dir]
import {start,enterLocalMode,addQuietEngine,highlightQuietEngine} from './lib.mjs';

const t=await start('deletes',8126);
const {page,ok,must,vis,text,until}=t;

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addQuietEngine(t,must);
  await highlightQuietEngine(t,must); // 2 highlights
  const go=()=>page.$eval('#cfGo',e=>e.disabled);
  const count=()=>text('#hlCount');

  // Clear all: Cancel keeps everything
  await t.openDrawer('#bHl','#drawer');
  await page.click('#clearAll');await page.waitForSelector('#confirmM:not(.hidden)');
  ok('Clear all asks for confirmation, naming what is lost',(await text('#cfH'))==='Clear all highlights?'&&(await text('#cfBody')).includes('2 highlights')&&(await text('#cfBody')).includes('Trash'));
  ok('the input has focus and the button starts disabled',await page.evaluate(()=>document.activeElement.id==='cfInput')&&await go());
  await page.type('#cfInput','no');
  ok('anything but "yes" keeps it disabled',await go());
  await page.keyboard.press('Enter');
  ok('Enter does nothing until "yes" is typed',await vis('#confirmM')&&(await count())==='2');
  await t.shot('confirm');
  await page.click('#confirmM [data-cancel]');await until(()=>document.querySelector('#confirmM').classList.contains('hidden'));
  ok('Cancel keeps all highlights',(await count())==='2'&&(await page.$$('mark.hl')).length>0);

  // Escape also answers no
  await page.click('#clearAll');await page.waitForSelector('#confirmM:not(.hidden)');
  await page.keyboard.press('Escape');await until(()=>document.querySelector('#confirmM').classList.contains('hidden'));
  ok('Escape keeps all highlights',(await count())==='2');
  await t.drawersGone(); // Escape closed the drawer too; a closing drawer catches taps

  // "yes" + Enter clears
  await t.openDrawer('#bHl','#drawer');
  await page.click('#clearAll');await page.waitForSelector('#confirmM:not(.hidden)');
  await page.type('#cfInput','  Yes ');
  ok('"yes" in any case, with spaces, enables the button',!(await go()));
  await page.keyboard.press('Enter');await until(()=>document.querySelector('#confirmM').classList.contains('hidden'));
  ok('Enter after "yes" clears every highlight',(await count())==='0'&&(await page.$$('mark.hl')).length===0&&(await text('#toast'))==='Moved to Trash');
  await t.closeDrawer();

  // Remove from shelf: typed confirmation only when highlights would be lost
  await highlightQuietEngine(t,must);
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('.book .c-more');await page.waitForSelector('#detM:not(.hidden)'); // phones reach Details through the cover's ⋯
  await page.click('#dRemove');await page.waitForSelector('#confirmM:not(.hidden)');
  ok('removing a book with highlights asks for "yes"',(await text('#cfH'))==='Remove this book?'&&(await text('#cfBody')).includes('2 highlights')&&(await text('#cfGo'))==='Remove book');
  await page.click('#confirmM [data-cancel]');await until(()=>document.querySelector('#confirmM').classList.contains('hidden'));
  ok('Cancel keeps the book and the Details dialog',(await page.$$('.book')).length===1&&await vis('#detM'));
  await page.click('#dRemove');await page.waitForSelector('#confirmM:not(.hidden)');
  await page.type('#cfInput','yes');await page.click('#cfGo');
  await until(()=>document.querySelector('#detM').classList.contains('hidden'));
  ok('typing "yes" removes the book',(await text('#toast'))==='Moved to Trash'&&(await page.$$('.book')).length===0);
});
