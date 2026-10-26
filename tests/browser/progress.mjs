// The Words tab's Progress panel. Usage: node tests/browser/progress.mjs [repo dir]
// Cards with known schedules and a study log are written straight into the local store (IndexedDB "upwind", store
// "kv"); due times sit at fixed hours of local days, never minutes from now, so no time of day moves a card to another
// day. Then the study log: Study writes the day's count once, when it closes or the page hides; another device's
// count shows when the Notebook opens; the backup carries it.
// Screenshots at 390×844, 320×568 and 1280×900, light and dark, go to tests/browser/out/progress/.
import {start,enterLocalMode,sleep,waitForFile,dayKey,readSettings,setStudyLog} from './lib.mjs';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const t=await start('progress',8159);
const {page,ok,must,vis,text,until}=t;
const shotDir=join(dirname(fileURLToPath(import.meta.url)),'out','progress');mkdirSync(shotDir,{recursive:true});
const DAY=864e5,HOUR=36e5,MIN=6e4;

/* ---------- the cards ---------- */
const now=Date.now();
const mid=k=>{const d=new Date(now);d.setHours(24*k,0,0,0);return d.getTime();}; // local midnight k days on
const ex=term=>({text:`A ${term} here.`,s:2,e:2+term.length,bookId:'b1',pid:'p1',ws:0,we:0,title:'Word Book',at:now});
const word=(id,term,srs,added)=>({id,term,def:'',pos:'',defSource:'',examples:[ex(term)],added,...(srs?{srs}:{})});
const fact=(id,text,srs,added)=>({id,kind:'fact',text,blank:null,note:'',bookId:'b1',hlId:'h'+id,pid:'p1',ws:0,we:4,title:'Word Book',section:'',added,...(srs?{srs}:{})});
const srs=(due,interval)=>({due,interval,ease:2.5,reps:interval?2:0,lapses:0,seen:2});
const CARDS=[
  word('wa','abate',srs(now-3*DAY,3),1),          // overdue: due today, learning
  word('wb','bucolic',srs(now-MIN,0),2),          // sent back by Again a while ago: due today, learning
  word('wc','candor',srs(mid(1)-MIN,5),3),        // due tonight at 23:59: due today, learning
  word('wd','dearth',srs(mid(1)+12*HOUR,21),4),   // tomorrow noon, interval 21: learned
  fact('fe','Ink fades.',srs(mid(5)+8*HOUR,30),5),// a fact card in 5 days: learned
  word('wf','fecund',srs(mid(13)+HOUR,10),6),     // the last of the 14 days: learning
  word('wg','garrulous',srs(mid(20)+HOUR,45),7),  // past the two weeks: learned
  word('n1','halcyon',null,8),word('n2','iconoclast',null,9),word('n3','jejune',null,10),fact('n4','Salt keeps.',null,11) // new
];

/* ---------- helpers ---------- */
const seed=(words,clear=false)=>page.evaluate((words,clear)=>new Promise((res,rej)=>{
  const r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const tx=r.result.transaction('kv','readwrite'),s=tx.objectStore('kv');
    if(clear) s.delete(IDBKeyRange.bound('word:','word:￿'));
    words.forEach(w=>s.put(w,'word:'+w.id));tx.oncomplete=()=>{r.result.close();res();};tx.onerror=()=>rej(tx.error);};
}),words,clear);
// the day's new cards, in the study log as Study keeps it
const setNewToday=n=>setStudyLog(page,{[dayKey()]:{reviews:n,new:n}});
async function openWords(){
  await page.goto(t.base,{waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  if(await page.$eval('#nbTabWd',e=>e.getAttribute('aria-selected'))!=='true') await page.click('#nbTabWd');
  await until(()=>!document.querySelector('#wdList').textContent.includes('Gathering'));
}
const figs=()=>page.$$eval('#wpFigs .wp-fig',fs=>Object.fromEntries(fs.map(f=>[f.querySelector('dt').textContent,f.querySelector('dd').textContent])));
// a chart by its title: each bar's count (from its screen-reader text), height, label; the readout and the axis
const chart=title=>page.evaluate(title=>{
  const f=[...document.querySelectorAll('#wpCharts .wp-chart')].find(f=>f.querySelector('.wp-cap b').textContent===title);if(!f) return null;
  const bars=[...f.querySelectorAll('.wp-bars li')].map(li=>({tip:li.dataset.tip,sr:li.querySelector('.vh').textContent,n:+(li.dataset.tip.match(/: (\d+)/)||[])[1],
    h:li.querySelector('i')?li.querySelector('i').getBoundingClientRect().height:0,em:li.querySelector('em')?.textContent||''}));
  return {bars,read:f.querySelector('.wp-read').textContent,axis:[...f.querySelectorAll('.wp-axis span')].map(s=>s.textContent),none:f.querySelector('.wp-none')?.textContent||''};
},title);
// the page with the html/body sideways-clip backstop off: nothing wider than the screen
const wide=()=>page.evaluate(()=>{const off=document.createElement('style');off.textContent='html,body{overflow-x:visible!important}';document.head.append(off);
  const de=document.documentElement,w=de.scrollWidth>de.clientWidth;off.remove();return w;});
async function shoot(label){
  const bad=[];
  for(const [w,h] of [[390,844],[320,568],[1280,900]]) for(const theme of ['light','dark']){
    await page.setViewport({width:w,height:h,deviceScaleFactor:w<500?2:1}); // no touch: changing it reloads the page
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    if(await wide()) bad.push(`${w}px ${theme}: sideways scroll`);
    await page.$eval('#wdProg',e=>e.scrollIntoView({block:'start'}));
    await page.screenshot({path:join(shotDir,`${label}-${w}-${theme}.png`)});
  }
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});
  await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  if(bad.length) console.log(bad.join('\n'));
  return bad;
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

await t.run(async()=>{
  await enterLocalMode(t,must);

  /* ---------- no cards: no panel ---------- */
  await openWords();
  ok('no cards: no Progress panel, no counts line',!(await vis('#wdProg'))&&(await text('#wdStats'))==='');

  /* ---------- the figures ---------- */
  await seed(CARDS);await setNewToday(18);
  await openWords();
  ok('the panel sits at the top of the Words tab, above the search',await vis('#wdProg')&&await page.evaluate(()=>{const p=document.querySelector('#wdProg');return p.parentElement.id==='nbPanelWd'&&p.compareDocumentPosition(document.querySelector('#wdCtrl'))&Node.DOCUMENT_POSITION_FOLLOWING;})>0);
  ok('figures: 3 due today, 2 new left (18 of 20 used), 4 learning, 3 learned, 11 in all',same(await figs(),{'Due today':'3','New left':'2','Learning':'4','Learned':'3','Total':'11'}));
  ok('the counts line under the title keeps words and facts; due moved into the panel',(await text('#wdStats'))==='9 words · 2 facts');
  ok('each figure says what it counts on hover',await page.$$eval('#wpFigs .wp-fig',fs=>fs.every(f=>f.title.length>20)));
  ok('Study is in the panel, once',await vis('#wdProg #wdStudy')&&(await page.$$('#wdStudy')).length===1&&!(await page.$('#wdCtrl .btn.sea')));
  await setNewToday(0);await openWords();
  ok('a fresh day: every new card is left for today (4 of 20)',(await figs())['New left']==='4');

  /* ---------- the chart: folded on a phone, open on a click, remembered ---------- */
  ok('on a phone the chart starts folded, the summary showing',!(await page.$eval('#wpMore',d=>d.open))&&await vis('#wpMore>summary')&&(await text('#wpMore>summary'))==='Reviews by day');
  await page.click('#wpMore>summary');
  ok('a click opens it',await page.$eval('#wpMore',d=>d.open));
  let c=await chart('Coming up');
  ok('Coming up: a bar per day for 14 days',c&&c.bars.length===14);
  ok('Coming up: today has the 3 due (overdue included), then tomorrow 1, day 5 the fact card, day 13 one, the rest none',same(c.bars.map(b=>b.n),[3,1,0,0,0,1,0,0,0,0,0,0,0,1]));
  ok('bars scale to the busiest day; an empty day draws none',c.bars[0].h>c.bars[1].h*2.5&&Math.abs(c.bars[1].h-c.bars[5].h)<.5&&c.bars[2].h===0);
  ok('only today’s bar is labelled with its count',same(c.bars.map(b=>b.em),['3',...Array(13).fill('')]));
  ok('each bar names its day and count for screen readers',c.bars[0].sr==='Today: 3 cards'&&/: 1 card$/.test(c.bars[1].sr)&&c.bars.every(b=>b.sr===b.tip));
  ok('the readout sums the two weeks; the axis runs from Today to the 14th day',c.read==='6 cards in 14 days'&&c.axis[0]==='Today'&&c.axis[1]===await page.evaluate(t=>new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'}),mid(13)));
  await page.hover('#wpCharts .wp-bars li:nth-child(6)');
  c=await chart('Coming up');
  ok('hovering a bar reads its day and count',c.read===c.bars[5].tip&&/^\w+, .+: 1 card$/.test(c.read)&&await page.$eval('#wpCharts .wp-bars li:nth-child(6)',li=>li.classList.contains('on')));
  await page.mouse.move(5,5);
  ok('leaving the bars brings the sum back',(await chart('Coming up')).read==='6 cards in 14 days');
  await page.tap('#wpCharts .wp-bars li:nth-child(2)');
  ok('a tap on a bar reads it too, and it stays',(await chart('Coming up')).read===(await chart('Coming up')).bars[1].tip);
  await openWords();
  ok('the chart stays open after a reload',await page.$eval('#wpMore',d=>d.open));
  await page.click('#wpMore>summary');await openWords();
  ok('…and stays folded once folded',!(await page.$eval('#wpMore',d=>d.open)));
  await page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('upwind:prefs'));delete p.wpOpen;localStorage.setItem('upwind:prefs',JSON.stringify(p));});
  await page.setViewport({width:1280,height:900});await openWords();
  ok('on a wider screen it starts open',await page.$eval('#wpMore',d=>d.open));
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});

  /* ---------- a phone: compact, nothing sideways ---------- */
  await page.setViewport({width:320,height:568,deviceScaleFactor:2,isMobile:true,hasTouch:true});await openWords();
  if(await page.$eval('#wpMore',d=>d.open)) await page.click('#wpMore>summary');
  const m=await page.evaluate(()=>{const p=document.querySelector('#wdProg').getBoundingClientRect(),l=document.querySelector('#wdList').getBoundingClientRect();
    return {h:p.height,list:l.top+scrollY,figs:[...document.querySelectorAll('#wpFigs .wp-fig')].map(f=>f.getBoundingClientRect().top)};});
  ok('320 px: the five figures share one row',m.figs.length===5&&m.figs.every(y=>Math.abs(y-m.figs[0])<1));
  ok('320 px: every label fits its column (none runs into the next)',await page.$$eval('#wpFigs dt,#wpFigs dd',es=>es.every(e=>e.scrollWidth<=e.clientWidth)));
  ok('320 px, folded: the panel is compact (under 190 px) and the list starts within two screens',m.h<190&&m.list<2*568);
  ok('320 px, folded: nothing passes the screen’s edge',!(await wide()));
  await page.click('#wpMore>summary');
  ok('320 px, open: nothing passes the screen’s edge',!(await wide()));
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});await openWords();
  const top=await page.$eval('#wdList',l=>l.getBoundingClientRect().top+scrollY);
  ok('390 px with the chart open: the first word starts on the first screen and a half',top<1.5*844);
  ok('screenshots: no sideways scroll at any size, light or dark',!(await shoot('panel')).length);

  /* ---------- Study opens from the panel ---------- */
  await page.click('#wdStudy');await page.waitForSelector('#study:not(.hidden)');
  await until(()=>!document.querySelector('#syCard').textContent.includes('Gathering'));
  ok('Study opens from the panel with the due cards first',/^1 of \d+$/.test(await text('#syProg'))&&['abate','bucolic'].includes(await page.$eval('#syCard .sy-term',e=>e.textContent)));
  await page.click('#syBack');await page.waitForSelector('#shelf:not(.hidden)');

  /* ---------- the study log: the last 30 days and the streak ---------- */
  const D=k=>dayKey(mid(k)),short=k=>page.evaluate(t=>new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'}),mid(k));
  await setStudyLog(page,{[D(-29)]:{reviews:4,new:1},[D(-3)]:{reviews:7,new:0},[D(-2)]:{reviews:1,new:0},[D(-1)]:{reviews:12,new:3},[D(-30)]:{reviews:50,new:0},[D(-61)]:{reviews:9,new:0}});
  await openWords();
  c=await chart('Reviewed');
  ok('Reviewed: a bar per day for the last 30 days, today last (a day before them left out)',c&&c.bars.length===30&&same(c.bars.map(b=>b.n),[4,...Array(25).fill(0),7,1,12,0]));
  ok('Reviewed: the sum, the axis from 29 days ago to Today, no label while today has no review',c.read==='24 reviews in 30 days'&&c.axis[0]===await short(-29)&&c.axis[1]==='Today'&&c.bars.every(b=>!b.em)&&c.bars[28].sr===c.bars[28].tip&&/: 12 reviews$/.test(c.bars[28].tip));
  ok('the streak: 3 days in a row up to yesterday (today has none yet)',(await text('#wpStreak'))==='3-day streak'&&await vis('#wpStreak'));

  // Study keeps the count in memory and writes it when the page hides and when Study closes, never per card
  const todayLog=async want=>{let l;for(const end=Date.now()+5000;Date.now()<end;await sleep(50)){l=(((await readSettings(page))||{}).studyLog||{})[dayKey()];if(want(l))return l;}return l;};
  const rate=async(k,prog)=>{await page.keyboard.press('Space');await sleep(30);await page.keyboard.press(k);await until(p=>document.querySelector('#syProg').textContent.startsWith(p)||document.querySelector('#syCard').textContent.includes('All caught up'),prog);};
  await page.click('#wdStudy');await page.waitForSelector('#study:not(.hidden)');await until(()=>!document.querySelector('#syCard').textContent.includes('Gathering'));
  await rate('2','2 of');await rate('2','3 of');
  ok('two ratings, nothing written yet',!(await readSettings(page)).studyLog[dayKey()]);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'));delete document.visibilityState;});
  let l=await todayLog(l=>l&&l.reviews===2);
  ok('the page hiding writes the count: 2 reviews today, no new card',same(l,{reviews:2,new:0}));
  const third=await page.$eval('#syCard',e=>e.textContent);
  await rate('3','4 of');
  await page.click('#syBack');await page.waitForSelector('#shelf:not(.hidden)');
  l=await todayLog(l=>l&&l.reviews===3);
  ok('leaving Study writes the rest: 3 reviews today',l&&l.reviews===3&&l.new===(/halcyon/.test(third)?1:0));
  ok('writing keeps the last 60 days and drops older ones',await readSettings(page).then(s=>!(D(-61) in s.studyLog)&&s.studyLog[D(-30)].reviews===50&&s.studyLog[D(-29)].reviews===4));
  await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');await until(()=>!document.querySelector('#wdList').textContent.includes('Gathering'));
  c=await chart('Reviewed');
  ok('back in the Words tab: today’s bar, labelled, and the streak grown to 4',c.bars[29].n===3&&c.bars[29].em==='3'&&c.read==='27 reviews in 30 days'&&(await text('#wpStreak'))==='4-day streak');
  ok('reviewed screenshots: no sideways scroll, light or dark',!(await shoot('reviewed')).length);

  // another device studied 4 days ago: the Notebook reads settings:app again when it opens
  await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');
  await setStudyLog(page,{...(await readSettings(page)).studyLog,[D(-4)]:{reviews:5,new:0}});
  await page.click('#nbBtn');await page.waitForSelector('#notebook:not(.hidden)');
  ok('another device’s day shows when the Notebook opens, without a reload',await until(()=>document.querySelector('#wpStreak').textContent==='5-day streak')&&(await chart('Reviewed')).read==='32 reviews in 30 days');

  // the backup carries the log
  await page.click('#nbBack');await page.waitForSelector('#shelf:not(.hidden)');
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');await page.click('#backupBtn');
  const f=await waitForFile(t.dl,/^own-shelf-backup-.*\.json$/),bk=f&&JSON.parse(readFileSync(join(t.dl,f),'utf8'));
  ok('Back up shelf carries the study log',!!bk&&bk.studyLog[dayKey()].reviews===3&&bk.studyLog[D(-4)].reviews===5);
  await page.click('#setM [data-cancel]');

  // a streak longer than the log keeps
  await setStudyLog(page,Object.fromEntries(Array.from({length:70},(_,i)=>[D(-i),{reviews:1,new:0}])));await openWords();
  ok('a streak longer than the 60 days kept reads 60+',(await text('#wpStreak'))==='60+ day streak');

  /* ---------- only new cards, no reviews: nothing to draw ---------- */
  await seed(CARDS.filter(w=>!w.srs),true);await setStudyLog(page,{});await openWords();
  if(!(await page.$eval('#wpMore',d=>d.open))) await page.click('#wpMore>summary');
  c=await chart('Coming up');
  ok('only new cards: no bars, a line saying nothing is due',c.bars.length===0&&c.none==='Nothing due in the next two weeks.'&&same(await figs(),{'Due today':'0','New left':'4','Learning':'0','Learned':'0','Total':'4'}));
  c=await chart('Reviewed');
  ok('no reviews: a line saying so, and no streak',c.bars.length===0&&c.none==='No reviews in the last 30 days.'&&!(await vis('#wpStreak')));
});
