// Finishing a book: real reading time is needed, the cover says "✓ Finished", and Details can override it either way.
// Usage: node tests/browser/finish.mjs [repo dir]
import {start,enterLocalMode,addQuietEngine,addMarkdown} from './lib.mjs';

const t=await start('finish',8129);
const {page,ok,must,vis,text,until}=t;
// The app's reading time comes from Date.now(); this lets the test move the clock forward. Its reading-time clock
// ticks every 5 s (a setInterval adding to readMs); __ticks counts those ticks, so the test can wait for the next.
await page.evaluateOnNewDocument(()=>{const real=Date.now.bind(Date);let off=0;Date.now=()=>real()+off;window.__advance=ms=>{off+=ms;};
  const si=window.setInterval;window.__ticks=0;
  window.setInterval=(f,ms,...a)=>si(typeof f==='function'&&String(f).includes('readMs')?(...b)=>{f(...b);window.__ticks++;}:f,ms,...a);});

await t.run(async()=>{
  await enterLocalMode(t,must);
  await addQuietEngine(t,must); // 69 words: finishing needs 20 s of reading
  const toEnd=()=>page.evaluate(()=>{scrollTo(0,document.documentElement.scrollHeight);dispatchEvent(new Event('scroll'));});
  const done=title=>page.$$eval('.book',(bs,tt)=>{const b=bs.find(x=>x.querySelector('.c-t').textContent===tt);return b?!!b.querySelector('.c-done'):null;},title);
  const home=async()=>{await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');};
  // the next tick of the reading-time clock after the end came into view (an IntersectionObserver: a frame later)
  const tick=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    must('the reading-time clock ticks',await page.waitForFunction(n=>__ticks>n,{timeout:8000},await page.evaluate(()=>__ticks)).then(()=>true,()=>false));};

  // reaching the end straight away
  await toEnd();await tick();await home();
  ok('reaching the end at once does not finish a book',(await done('The Quiet Engine'))===false);
  ok('covers no longer carry a ribbon',(await page.$$('.book .ribbon')).length===0);

  // read for 25 s (moved clock) with the end on screen
  await page.click('.book .cover');await page.waitForSelector('#reader:not(.hidden)');
  await toEnd();await page.evaluate(()=>__advance(25000));await toEnd();await tick();await home();
  ok('20 s of reading with the end on screen finishes the book',(await done('The Quiet Engine'))===true);
  ok('the cover says ✓ Finished, without a percentage',(await text('.book .c-done'))==='✓ Finished'&&!(await text('.book .c-f')).includes('%'));
  ok('screen readers hear "finished"',(await page.$eval('.book .cover',e=>e.getAttribute('aria-label'))).endsWith('finished'));
  await t.shot('finished-cover');

  // Details: the state, and a manual override either way
  const closeDet=async()=>{await page.click('#detM [data-cancel]');await until(()=>document.querySelector('#detM').classList.contains('hidden'));};
  const toggled=label=>until(l=>document.querySelector('#dFinish').textContent===l,label);
  await page.click('.book .c-more');await page.waitForSelector('#detM:not(.hidden)');
  ok('Details shows ✓ Finished with Mark as reading',await vis('#dDone')&&(await text('#dState'))==='✓ Finished'&&(await text('#dFinish'))==='Mark as reading');
  await t.shot('details');
  await page.click('#dFinish');await toggled('Mark as finished');
  ok('Mark as reading drops ✓ Finished from the cover',(await text('#toast'))==='Marked as reading'&&(await done('The Quiet Engine'))===false&&(await text('#dState')).startsWith('Reading · '));
  ok('progress goes back below 100%',!(await text('.book .c-f')).includes('100%'));
  await closeDet();
  await page.click('.book .c-more');await page.waitForSelector('#detM:not(.hidden)');
  ok('an unfinished book shows Reading with Mark as finished',(await text('#dState')).startsWith('Reading · ')&&(await text('#dFinish'))==='Mark as finished');
  await page.click('#dFinish');await toggled('Mark as reading');
  ok('Mark as finished puts ✓ Finished on the cover',(await text('#toast'))==='Marked as finished'&&(await done('The Quiet Engine'))===true);
  await closeDet();

  // a long book: jumping to the end and reading for 30 s isn't enough
  const md='# A Long Read\n\n'+Array.from({length:12},(_,i)=>`## Part ${i+1}\n\n`+'Words fill the long read so it takes a while. '.repeat(30)).join('\n\n');
  await addMarkdown(t,'long-read.md',md,'A Long Read');
  await toEnd();await page.evaluate(()=>__advance(30000));await toEnd();await tick();await home();
  ok('a long book jumped to the end is not finished after 30 s of reading',(await done('A Long Read'))===false);
  await page.click('.cover[aria-label^="A Long Read"]');await page.waitForSelector('#reader:not(.hidden)');
  await page.$eval('#barTitle',e=>e.click());await page.waitForSelector('#detM:not(.hidden)'); // the title is hidden at phone width
  await page.click('#dFinish');await toggled('Mark as reading');await closeDet();await home();
  ok('Mark as finished from the reader finishes the open book',(await done('A Long Read'))===true);
});
