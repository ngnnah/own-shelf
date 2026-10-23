// Dialogs: a tap outside has to start and end outside; outside or Escape saves Book details and Settings and keeps the
// Add dialog's draft; the date quick picks (Today, Yesterday, the phone's own picker); the reader's heading opens
// Details. Usage: node tests/browser/dialogs.mjs [repo dir]
import {start,enterLocalMode,addMarkdown,pasteHtml,sleep} from './lib.mjs';

const t=await start('dialogs',8151);
const {page,ok,must,vis,text,until}=t;
const md=title=>`# ${title}\n\n`+'Plain words for a plain test book about dialogs. '.repeat(12);
const home=async()=>{if(!(await vis('#shelf'))){await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');}};
const hidden=id=>until(id=>document.querySelector(id).classList.contains('hidden'),id);
const details=async title=>{await home();await page.click(`.c-more[aria-label="Details for ${title}"]`);await page.waitForSelector('#detM:not(.hidden)');};
const val=sel=>page.$eval(sel,e=>e.value);
const setVal=(sel,v)=>page.$eval(sel,(e,v)=>{e.value=v;},v);
const titles=()=>page.$$eval('.shelf-row .c-t',ts=>ts.map(x=>x.textContent));
const authorOf=title=>page.$$eval('.cover',(cs,tt)=>{const c=cs.find(x=>x.querySelector('.c-t').textContent===tt);return c&&c.querySelector('.c-a')?c.querySelector('.c-a').textContent:null;},title);
const labels=()=>page.$$eval('.shelf-label',ls=>ls.map(l=>l.firstChild.textContent.trim()));
const toast=s=>until(s=>{const t=document.querySelector('#toast');return t.classList.contains('on')&&t.textContent.includes(s);},s);
const noToast=()=>page.evaluate(()=>{const t=document.querySelector('#toast');t.classList.remove('on');t.textContent='';});
const toastOn=()=>page.$eval('#toast',e=>e.classList.contains('on'));
// a plain tap on the backdrop, in its padding at the top left
const outside=async()=>{must('the top left corner is the backdrop',await page.evaluate(()=>document.elementFromPoint(6,6).classList.contains('modal')));await page.mouse.click(6,6);};
// press inside an element, drag to the backdrop, release there (like selecting a field's text too far)
const dragOut=async sel=>{const r=await page.$eval(sel,e=>{const b=e.getBoundingClientRect();return {x:b.x+12,y:b.y+b.height/2};});await page.mouse.move(r.x,r.y);await page.mouse.down();await page.mouse.move(6,6,{steps:6});await page.mouse.up();await sleep(400);};
// the date written the way link import writes a published one
const day=ago=>page.evaluate(ago=>{const d=new Date();d.setDate(d.getDate()-ago);return d.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});},ago);
const pick=(f,ago)=>page.click(`.dq[data-for="${f}"] [data-ago="${ago}"]`);
const shots=async(label,before)=>{
  for(const [w,h] of [[390,844],[375,667],[1280,800]]) for(const s of ['light','dark']){
    await page.setViewport({width:w,height:h,deviceScaleFactor:w<500?2:1});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:s}]);
    if(before) await before();await sleep(150);await t.shot(`${label}-${w}-${s}`);
  }
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
};

await t.run(async()=>{
  await enterLocalMode(t,must);
  for(const title of ['Plain Dialogs','Undated Book']){await addMarkdown(t,title.toLowerCase().replace(/ /g,'-')+'.md',md(title),title);await home();}
  const today=await day(0),yesterday=await day(1);

  // 1. pressing inside and releasing on the backdrop is not a tap outside
  await details('Plain Dialogs');
  await dragOut('#dTitle');
  ok('Details: press in a field, release outside: the dialog stays',await vis('#detM'));
  await page.click('#detM [data-cancel]');await hidden('#detM');
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  await dragOut('#fTitle');
  ok('Add: press in a field, release outside: the dialog stays',await vis('#importM'));
  await page.click('#importM [data-cancel]');await hidden('#importM');

  // 2. the date quick picks
  await details('Plain Dialogs');
  const q=await page.$$eval('.dq[data-for="dWritten"] :is(button,input)',c=>c.map(x=>x.getAttribute('aria-label')||x.textContent.trim()));
  ok('under Date written: Today, Yesterday, then the calendar',q.join('|')==='Today|Yesterday|Pick a date');
  ok('Today stands out from Yesterday',await page.$eval('.dq[data-for="dWritten"]',d=>{const [a,b]=d.querySelectorAll('.chip');return getComputedStyle(a).backgroundColor!==getComputedStyle(b).backgroundColor;}));
  await pick('dWritten',1);
  ok('Yesterday fills the date the way link import writes one',(await val('#dWritten'))===yesterday);
  await pick('dWritten',0);
  ok('Today fills today’s date',(await val('#dWritten'))===today);
  const cal=await page.$eval('.dq[data-for="dWritten"] input',i=>{const r=i.getBoundingClientRect(),c=i.closest('.chip').getBoundingClientRect();
    return {type:i.type,cover:Math.abs(r.width-c.width)<2&&Math.abs(r.height-c.height)<2,clear:getComputedStyle(i).opacity==='0',font:parseFloat(getComputedStyle(i).fontSize)};});
  ok('the calendar is a native date input lying over its chip, so one tap opens the phone’s picker',cal.type==='date'&&cal.cover&&cal.clear);
  ok('the date input is at least 16 px, so iOS doesn’t zoom',cal.font>=16);
  await page.$eval('.dq[data-for="dWritten"] input',i=>{i.value='2019-05-04';i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));});
  ok('picking a day in the calendar fills it the same way, on that local day',(await val('#dWritten'))==='May 4, 2019');
  await setVal('#dWritten','July 2023');
  ok('typing free text still works',(await val('#dWritten'))==='July 2023');
  await pick('dWritten',0);
  await shots('details');

  // 3. a tap outside saves Details
  await setVal('#dTitle','Tapped Outside');await setVal('#dAuthor','Out Side');
  await outside();
  ok('a tap outside saves Details: closed, "Details saved"',await hidden('#detM')&&await toast('Details saved'));
  ok('the shelf shows the new title and author',(await titles()).includes('Tapped Outside')&&(await authorOf('Tapped Outside'))==='Out Side');
  await details('Tapped Outside');
  ok('reopened, Details shows what was saved',(await val('#dTitle'))==='Tapped Outside'&&(await val('#dAuthor'))==='Out Side'&&(await val('#dWritten'))===today);

  // Escape saves too
  await setVal('#dAuthor','Esc Ape');await page.keyboard.press('Escape');
  ok('Escape saves Details',await hidden('#detM')&&await toast('Details saved')&&(await authorOf('Tapped Outside'))==='Esc Ape');

  // Cancel discards
  await details('Tapped Outside');await setVal('#dTitle','Never Saved');
  await page.click('#detM [data-cancel]');await hidden('#detM');
  ok('Cancel discards the changes',!(await titles()).includes('Never Saved')&&(await titles()).includes('Tapped Outside'));

  // nothing changed: closes quietly
  await details('Tapped Outside');await noToast();await outside();
  ok('unchanged, a tap outside closes Details without a toast',await hidden('#detM')&&(await sleep(400),!(await toastOn())));
  await details('Tapped Outside');await noToast();await page.keyboard.press('Escape');
  ok('unchanged, Escape closes Details without a toast',await hidden('#detM')&&(await sleep(400),!(await toastOn())));

  // 4. the Add dialog keeps its draft after a tap outside
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  await until(()=>document.activeElement.id==='paste'); // Add focuses the paste box a moment after opening
  await pasteHtml(page,'<h1>Draft Kept</h1><p>'+'Words of a draft that waits for later. '.repeat(10)+'</p>');
  await until(()=>document.querySelector('#det').textContent.includes('Draft Kept'));
  await setVal('#link','https://example.com/draft');await page.type('#fAuthor','Dee Draft');await pick('fWritten',1);
  ok('Yesterday fills the Add dialog’s date',(await val('#fWritten'))===yesterday);
  await shots('add',()=>page.$eval('#fWritten',e=>e.scrollIntoView({block:'center'})));
  await outside();
  ok('a tap outside closes the Add dialog',await hidden('#importM'));
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  ok('reopened, Add shows the draft: paste, link, author, date',(await text('#paste')).includes('Draft Kept')&&(await val('#link'))==='https://example.com/draft'&&
    (await val('#fAuthor'))==='Dee Draft'&&(await val('#fWritten'))===yesterday&&(await text('#det')).includes('Draft Kept'));
  await page.keyboard.press('Escape');await hidden('#importM');
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  ok('Escape keeps the draft too',(await text('#paste')).includes('Draft Kept')&&(await val('#fAuthor'))==='Dee Draft');
  await page.click('#importM [data-cancel]');await hidden('#importM');
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  ok('after Cancel, Add opens empty',!(await text('#paste')).trim()&&!(await val('#link'))&&!(await val('#fAuthor'))&&!(await val('#fWritten')));

  // adding a book clears the draft
  await pasteHtml(page,'<h1>Yesterday Book</h1><p>'+'Words of a book written the day before today. '.repeat(10)+'</p>');
  await until(()=>document.querySelector('#det').textContent.includes('Yesterday Book'));
  await pick('fWritten',1);await outside();await hidden('#importM');
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  await page.click('#impGo');await t.reader();
  ok('the book is added with the picked date',(await text('.hero .log')).includes(yesterday));
  await home();await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');
  ok('after adding, Add opens empty',!(await text('#paste')).trim()&&!(await val('#fWritten')));
  await page.click('#importM [data-cancel]');await hidden('#importM');

  // a deep link starts fresh
  await page.click('#addBtn');await page.waitForSelector('#importM:not(.hidden)');await page.type('#fAuthor','Left Behind');await outside();await hidden('#importM');
  await page.goto(t.base+'?text='+encodeURIComponent('Shared text that came in from another app. '.repeat(8)),{waitUntil:'networkidle0'});
  await page.waitForSelector('#importM:not(.hidden)');await until(()=>document.querySelector('#paste').textContent.includes('Shared text'));
  ok('a deep link opens Add fresh',!(await val('#fAuthor')));
  await page.click('#importM [data-cancel]');await hidden('#importM');

  // 5. Arrange by Date written: Today and Yesterday sort as dates
  await page.click('#segGroup [data-g="written"]');
  const yr=today.slice(-4),yyr=yesterday.slice(-4);
  ok('Arrange by Date written shelves them by year',(await labels()).join('|')===(yr===yyr?`${yr}|Undated`:`${yr}|${yyr}|Undated`));
  const tt=await titles();
  ok('today’s book before yesterday’s, the undated one last',tt.indexOf('Tapped Outside')<tt.indexOf('Yesterday Book')&&tt.at(-1)==='Undated Book');
  await page.click('#segGroup [data-g="added"]');

  // 6. Settings: a tap outside saves; the Trash and confirmations still cancel
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  await setVal('#sMeanings [data-c="amber"]','Lines kept');await outside();
  ok('a tap outside saves Settings',await hidden('#setM')&&await toast('Settings saved'));
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  ok('the renamed meaning is kept',(await val('#sMeanings [data-c="amber"]'))==='Lines kept');
  await setVal('#sMeanings [data-c="amber"]','');await page.click('#sSave');await hidden('#setM');
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');await page.click('#trashBtn');await page.waitForSelector('#trashM:not(.hidden)');
  await outside();
  ok('a tap outside closes the Trash',await hidden('#trashM'));

  // 7. the heading opens Details on a phone
  await page.click('.cover[aria-label^="Tapped Outside"]');await t.reader();
  ok('at 390 px the bar hides its title',await page.$eval('#barTitle',e=>getComputedStyle(e).display==='none'));
  ok('the heading shows it can be tapped',await page.$eval('.hero h1',h=>getComputedStyle(h).cursor==='pointer'));
  ok('a pencil after the byline: a button named "Edit details"',await page.$eval('.hero .byline .ed',b=>b.tagName==='BUTTON'&&b.getAttribute('aria-label')==='Edit details').catch(()=>false));
  await t.shot('hero');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await t.shot('hero-dark');
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await sleep(150);await t.shot('hero-1280');await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await page.click('.hero h1');
  ok('tapping the heading opens Details',await page.waitForSelector('#detM:not(.hidden)',{timeout:2000}).then(()=>true,()=>false)&&(await val('#dTitle'))==='Tapped Outside');
  await page.click('#detM [data-cancel]');await hidden('#detM');
  // selecting the heading's text (a drag, or a double click on a word) doesn't
  const h1=await page.$eval('.hero h1',h=>{const r=h.getBoundingClientRect();return {x1:r.x+4,y1:r.y+r.height*.25,x2:r.right-6,y2:r.bottom-r.height*.25,cx:r.x+r.width*.3,cy:r.y+r.height*.25};});
  await page.mouse.move(h1.x1,h1.y1);await page.mouse.down();await page.mouse.move(h1.x2,h1.y2,{steps:8});await page.mouse.up();await sleep(600);
  ok('dragging to select the heading doesn’t open Details',!(await vis('#detM'))&&(await page.evaluate(()=>getSelection().toString().length))>3);
  await page.evaluate(()=>getSelection().removeAllRanges());
  await page.mouse.move(h1.cx,h1.cy);await page.mouse.down({clickCount:1});await page.mouse.up({clickCount:1});await page.mouse.down({clickCount:2});await page.mouse.up({clickCount:2});await sleep(600);
  ok('a double click selecting a word doesn’t open Details',!(await vis('#detM'))&&(await page.evaluate(()=>getSelection().toString().trim().length))>0);
  await page.evaluate(()=>getSelection().removeAllRanges());
  await page.focus('.hero .ed');await page.keyboard.press('Enter');
  ok('the pencil opens Details from the keyboard',await page.waitForSelector('#detM:not(.hidden)',{timeout:2000}).then(()=>true,()=>false));
  await setVal('#dTitle','Renamed Here');await outside();await hidden('#detM');
  ok('saved from the reader, the heading shows the new title',await until(()=>[...document.querySelectorAll('.hero h1 .ln')].map(s=>s.textContent).join(' ')==='Renamed Here'));

  // a confirmation over Details: a tap outside answers no and leaves Details open
  await t.select('#col p.hp');await page.click('#tool [data-c="mint"]');await until(()=>document.querySelector('#hlCount').textContent==='1');
  await sleep(800); // the shelf entry's highlight count is saved after 0.5 s; Remove asks only when it has some
  await page.click('.hero h1');await page.waitForSelector('#detM:not(.hidden)');
  await page.click('#dRemove');await page.waitForSelector('#confirmM:not(.hidden)');
  await outside();
  ok('a tap outside a confirmation cancels it; Details stays open',await hidden('#confirmM')&&await vis('#detM')&&await vis('#reader'));
  await page.click('#detM [data-cancel]');await hidden('#detM');

  // no author or source: the byline holds just the pencil
  await home();await page.click('.cover[aria-label^="Undated Book"]');await t.reader();
  ok('without an author the pencil is still there',(await page.$eval('.hero .byline',b=>b.textContent.trim()))===''&&!!(await page.$('.hero .byline .ed')));
  await t.shot('hero-no-author');
});
