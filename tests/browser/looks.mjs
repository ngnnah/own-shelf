// Looks: Settings → Look (Classic, Leather & vellum, Ukiyo-e, Scroll), per device in prefs.look and never synced,
// Leather & vellum by default; applied at once as data-look on <html>; the Theme button switching day and night
// within the Look (and the system's scheme when the Theme is automatic); only the chosen Look's heading font and
// texture files loading; Classic exactly as it was without the Looks' CSS; no SVG filters anywhere in the page's
// styles (Safari redraws them on every paint); the shelf band clipped by #shelf, #shelf's content where Classic
// has it, Scroll's edge curls; ink readable on the five highlight tints over each Look's paper; the browser bar's
// theme-color. Screenshots of every Look, day and night, shelf, Grid and reader, at 390 and 1280 px, beside the
// themes lab's own mocks of the same pins: tests/browser/out/looks/.
// Usage: node tests/browser/looks.mjs [repo dir]
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {start,sleep,enterLocalMode,addQuietEngine,highlightQuietEngine,addMarkdown,readSettings} from './lib.mjs';

const t=await start('looks',8160);
const {page,ok,must,until}=t;
const outDir=join(dirname(fileURLToPath(import.meta.url)),'out','looks');mkdirSync(outDir,{recursive:true});
const {pins}=JSON.parse(readFileSync(join(t.repo,'design','looks.json'),'utf8'));
const LOOKS=['leather','ukiyoe','scroll'];
const css=readFileSync(join(t.repo,'styles.css'),'utf8');
const START=css.indexOf('/* looks:'),END=css.indexOf('/* end looks */');
const prefs=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:prefs')||'{}'));
const look=()=>page.evaluate(()=>document.documentElement.dataset.look||'');
const tok=(name,p=page)=>p.evaluate(n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(),name);
const fontLinks=(p=page)=>p.$$eval('link[rel=stylesheet]',ls=>ls.map(l=>l.href).filter(h=>h.includes('fonts.googleapis.com')).join(' '));
const textures=(p=page)=>p.evaluate(()=>[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(n=>n.includes('/textures/')).map(n=>n.split('/textures/')[1]))].sort());
const settle=(p=page)=>p.evaluate(()=>document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
const home=async()=>{if(!(await t.vis('#shelf'))){await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');}};
// reload; the app may reopen the book that was open, so go back to the shelf
const reload=async()=>{await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('#shelf:not(.hidden),#reader:not(.hidden)');await home();await settle();};
const scheme=s=>page.emulateMediaFeatures([{name:'prefers-color-scheme',value:s}]);
async function pick(v){
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  await page.select('#sLook',v);
  await page.click('#sSave');await page.waitForSelector('#setM',{hidden:true}).catch(()=>{});
  await settle();
}
// in a fresh page with prefs.look already set (a later visit on this device)
async function visit(v){
  const p=await t.newPage();await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
  await p.evaluateOnNewDocument(v=>{const k='upwind:prefs',o=JSON.parse(localStorage.getItem(k)||'{}');o.look=v;localStorage.setItem(k,JSON.stringify(o));},v);
  await p.goto(t.base,{waitUntil:'networkidle0'});await p.waitForSelector('#shelf:not(.hidden)');await settle(p);
  return p;
}
// WCAG contrast of ink on each highlight tint laid over the page
const tintContrast=()=>page.evaluate(()=>{
  const cs=getComputedStyle(document.documentElement),c=document.createElement('canvas').getContext('2d',{willReadFrequently:true});
  const rgba=v=>{c.clearRect(0,0,1,1);c.fillStyle=v;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data];};
  const over=(top,bot)=>{c.fillStyle=bot;c.fillRect(0,0,1,1);c.fillStyle=top;c.fillRect(0,0,1,1);return [...c.getImageData(0,0,1,1).data];};
  const lum=a=>{const [r,g,b]=a.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const paper=cs.getPropertyValue('--paper').trim(),ink=rgba(cs.getPropertyValue('--ink').trim());
  return Object.fromEntries(['sky','coral','amber','sun','mint'].map(k=>[k,+ratio(ink,over(cs.getPropertyValue('--'+k).trim(),paper)).toFixed(2)]));
});

await t.run(async()=>{
  await scheme('light'); // the machine's own scheme may be dark (macOS switches at sunset)
  await enterLocalMode(t,must);
  await addMarkdown(t,'atlas.md','# Atlas of Winds\n\nBy Ines Calder\n\n'+'Plain words for a plain test book on the shelf. '.repeat(40),'Atlas of Winds');
  await home();await addQuietEngine(t,must);await highlightQuietEngine(t,must);
  await home();await settle();

  /* the default Look and the picker */
  ok('first visit: Leather & vellum (LOOK_DEFAULT), before any choice',await look()==='leather'&&!(await prefs()).look);
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  const opts=await page.$$eval('#sLook option',os=>os.map(o=>o.value+':'+o.textContent));
  ok('Settings → Look lists Classic and the three Looks',opts.join('|')==='classic:Classic|leather:Leather & vellum|ukiyoe:Ukiyo-e|scroll:Scroll');
  ok('the picker shows the Look on screen',await page.$eval('#sLook',s=>s.value)==='leather');
  await page.keyboard.press('Escape');await page.waitForSelector('#setM',{hidden:true}).catch(()=>{});
  ok('the Look loads only its own heading font',/IM\+Fell\+English/.test(await fontLinks())&&!/Zen\+Old\+Mincho/.test(await fontLinks()));
  ok('Leather & vellum day loads its own textures only',(await textures()).join()==='leather.jpg,vellum-day.jpg,wood.webp');
  ok('headings use the Look\'s font',(await tok('--display')).startsWith('"IM Fell English"'));
  ok('the browser bar takes the Look\'s chrome',await page.$$eval('meta[name=theme-color]',(ms,c)=>ms.every(m=>m.content===c),await tok('--chrome')));

  /* choosing a Look: at once, per device, kept, never synced */
  await pick('ukiyoe');
  ok('choosing Ukiyo-e applies it at once',await look()==='ukiyoe'&&(await tok('--paper'))==='#F2EDE1');
  ok('the choice is kept in this device\'s prefs',(await prefs()).look==='ukiyoe');
  ok('…and not in the synced settings',!JSON.stringify(await readSettings(page)||{}).includes('ukiyoe'));
  ok('Ukiyo-e adds its font',/Zen\+Old\+Mincho/.test(await fontLinks()));
  await reload();
  ok('after a reload the Look is still Ukiyo-e',await look()==='ukiyoe'&&await page.$eval('#sLook',s=>s.value)==='ukiyoe');
  ok('after a reload only Ukiyo-e\'s font is asked for',/Zen\+Old\+Mincho/.test(await fontLinks())&&!/IM\+Fell/.test(await fontLinks()));
  const ut=(await textures()).join();
  ok(`…and only its day textures (${ut})`,ut==='washi-day.jpg,wave-img-day.svg,wood.webp,woodblock.webp');

  /* day and night within the Look */
  await page.click('.cover[aria-label^="The Quiet Engine"]');await t.reader();
  await page.click('#bTheme');await settle();
  ok('Theme switches Ukiyo-e to night',await look()==='ukiyoe'&&(await page.evaluate(()=>document.documentElement.dataset.theme))==='dark'&&(await tok('--paper'))==='#121826');
  ok('night swaps the page texture',(await textures()).includes('washi-night.jpg'));
  ok('the browser bar follows to night',await page.$eval('meta[name=theme-color]',m=>m.content)===await tok('--chrome')&&(await tok('--chrome'))==='#13284A');
  await page.click('#bTheme');await settle();
  ok('Theme switches back to day',(await tok('--paper'))==='#F2EDE1');
  await page.evaluate(()=>{const o=JSON.parse(localStorage.getItem('upwind:prefs'));o.theme='auto';localStorage.setItem('upwind:prefs',JSON.stringify(o));});
  await reload();
  await scheme('dark');await settle();
  ok('automatic Theme: a dark system gets the Look\'s night',(await tok('--paper'))==='#121826');
  ok('…and the browser bar its night chrome',await page.$eval('meta[name=theme-color]',m=>m.content)==='#13284A');
  await scheme('light');await settle();
  ok('…and a light one its day',(await tok('--paper'))==='#F2EDE1'&&await page.$eval('meta[name=theme-color]',m=>m.content)==='#203A3A');

  /* only the chosen Look's font, Classic's none */
  for(const [v,want,not] of [['scroll',/IM\+Fell/,/Zen/],['classic',null,/IM\+Fell|Zen/]]){
    const p=await visit(v);const f=await fontLinks(p);
    ok(`a ${v} visit asks only for ${want?'its font':'the base fonts'}`,(!want||want.test(f))&&!not.test(f));
    const tx=await textures(p);
    ok(`a ${v} visit loads ${v==='classic'?'no textures':'only its day textures'}`,v==='classic'?tx.length===0:tx.join()==='parchment-day.jpg,roll.webp,wood.webp');
    if(v==='classic') ok('Classic keeps index.html\'s theme-color',await p.$$eval('meta[name=theme-color]',ms=>ms.map(m=>m.content).join())==='#F3EAD7,#1E1A16');
    await p.close();
  }

  /* no SVG filters in the page's styles; every texture the CSS names exists */
  ok('styles.css has no feTurbulence or SVG filter',!/feTurbulence|%3Cfilter|<filter/.test(css));
  const urls=[...new Set([...css.matchAll(/url\(textures\/([^)]+)\)/g)].map(m=>m[1]))];
  const status=await page.evaluate(async us=>Promise.all(us.map(u=>fetch('textures/'+u).then(r=>r.status+(r.headers.get('content-type')||'')))),urls);
  ok(`every texture named in styles.css is served as an image (${urls.length})`,urls.length>=10&&status.every(s=>s.startsWith('200image/')));
  for(const v of LOOKS) for(const s of ['light','dark']){
    await page.evaluate(v=>{const o=JSON.parse(localStorage.getItem('upwind:prefs'));o.look=v;localStorage.setItem('upwind:prefs',JSON.stringify(o));},v);
    await scheme(s);await reload();
    const filt=await page.evaluate(()=>{const bad=[];for(const e of document.querySelectorAll('*')) for(const ps of [null,'::before','::after']){const c=getComputedStyle(e,ps);
      if(/feTurbulence|%3Cfilter|<filter/i.test(c.backgroundImage+c.maskImage+c.webkitMaskImage)||/url\(/.test(c.filter)) bad.push(e.tagName+(e.id?'#'+e.id:'')+(ps||''));}return bad;});
    ok(`${v} ${s}: no live SVG filter on any element`,filt.length===0);
    ok(`${v} ${s}: the page texture is a file`,(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage)).includes('/textures/'));
    const tc=await tintContrast(),worst=Math.min(...Object.values(tc));
    console.log(`  ${v} ${s}: ink on the highlight tints`,JSON.stringify(tc));
    ok(`${v} ${s}: ink reads on all five highlight tints (≥ 4.5:1, worst ${worst})`,worst>=4.5);
  }
  await scheme('light');

  /* Classic: unchanged by the Looks' CSS (pixel for pixel), at phone and desktop sizes */
  await page.evaluate(()=>{const o=JSON.parse(localStorage.getItem('upwind:prefs'));o.look='classic';localStorage.setItem('upwind:prefs',JSON.stringify(o));});
  const stripped=css.slice(0,START)+css.slice(END+'/* end looks */'.length);
  for(const [w,h,d] of [[390,844,2],[1280,900,1]]){
    await page.setViewport({width:w,height:h,deviceScaleFactor:d});
    const shots=[];
    for(const strip of [false,true]){
      await page.setRequestInterception(strip);
      const handler=r=>{if(r.url().endsWith('/styles.css')) r.respond({status:200,contentType:'text/css',body:stripped});else r.continue();};
      if(strip) page.on('request',handler);
      await reload();await sleep(200);
      shots.push(await page.screenshot({fullPage:true}));
      if(strip){page.off('request',handler);await page.setRequestInterception(false);}
    }
    ok(`Classic at ${w} px is pixel for pixel what it was without the Looks' CSS`,shots[0].equals(shots[1]));
  }
  ok('Classic: no data-look, no texture, its own font',await look()===''&&(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage))==='none'&&(await tok('--display')).startsWith('"EB Garamond"'));

  /* layout: the band clipped by #shelf, #shelf's content where Classic has it, Scroll's curls; no sideways scroll */
  const contentBox=()=>page.$eval('#shelf .sh-top',e=>{const r=e.getBoundingClientRect();return [Math.round(r.left),Math.round(r.right)];});
  for(const [w,h,d] of [[390,844,2],[1280,900,1],[320,640,2]]){
    await page.setViewport({width:w,height:h,deviceScaleFactor:d});
    const box={};
    for(const v of ['classic',...LOOKS]){
      await page.evaluate(v=>{const o=JSON.parse(localStorage.getItem('upwind:prefs'));o.look=v;localStorage.setItem('upwind:prefs',JSON.stringify(o));},v);
      await reload();
      box[v]=(await contentBox()).join();
      if(v==='classic') continue;
      await page.addStyleTag({content:'html,body{overflow-x:visible!important}'});
      ok(`${v} at ${w} px: no sideways scroll with the backstop off`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const band=await page.$eval('#shelf .sh-top',e=>{const c=getComputedStyle(e,'::before'),r=e.getBoundingClientRect(),s=document.querySelector('#shelf').getBoundingClientRect();
        return {w:parseFloat(c.width),iw:innerWidth,edge:Math.round(s.left)===0&&Math.round(s.right)===innerWidth,clip:getComputedStyle(document.querySelector('#shelf')).overflowX};});
      ok(`${v} at ${w} px: the band spans the screen, clipped by #shelf`,band.edge&&band.clip==='clip'&&band.w>=band.iw-1);
      ok(`${v} at ${w} px: the shelf's content sits where Classic's does`,box[v]===box.classic);
      if(v==='scroll'){
        const curls=await page.evaluate(()=>['::before','::after'].map(ps=>{const c=getComputedStyle(document.body,ps);return [c.position,parseFloat(c.width),c.pointerEvents,c.left,c.right];}));
        const want=Math.min(21,Math.max(4,w*.016));
        ok(`Scroll at ${w} px: both edge curls fixed, ${want.toFixed(1)} px wide, not in the way`,curls.every(c=>c[0]==='fixed'&&Math.abs(c[1]-want)<.6&&c[2]==='none')&&curls[0][3]==='0px'&&curls[1][4]==='0px');
      }
    }
  }
  await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});await settle();
  ok('the Look picker is 16 px on a touch screen',await page.$eval('#sLook',s=>parseFloat(getComputedStyle(s).fontSize))>=16);
  await page.setViewport({width:390,height:844,deviceScaleFactor:2});

  /* screenshots: every Look, day and night, at 390 and 1280; then the lab's mocks of the same pins (a page in front
     of this one would stop its animation frames, so the lab comes after) */
  const SIZES=[[390,844,2],[1280,900,1]];
  for(const v of LOOKS) for(const s of ['light','dark']) for(const [w,h,d] of SIZES){
    await page.evaluate((v,s)=>{const o=JSON.parse(localStorage.getItem('upwind:prefs'));o.look=v;o.theme=s;o.view='shelves';localStorage.setItem('upwind:prefs',JSON.stringify(o));},v,s);
    await page.setViewport({width:w,height:h,deviceScaleFactor:d});
    await reload();
    await page.screenshot({path:join(outDir,`${v}-${s}-${w}-shelf.png`)});
    await page.evaluate(()=>{const o=JSON.parse(localStorage.getItem('upwind:prefs'));o.view='grid';localStorage.setItem('upwind:prefs',JSON.stringify(o));});
    await reload();
    await page.screenshot({path:join(outDir,`${v}-${s}-${w}-grid.png`)});
    await page.click('.cover[aria-label^="The Quiet Engine"]');await t.reader();await settle();
    await page.evaluate(()=>{const m=document.querySelector('#col mark.hl');if(m) scrollTo(0,m.getBoundingClientRect().top+scrollY-200);});await sleep(300);
    await page.screenshot({path:join(outDir,`${v}-${s}-${w}-reader.png`)});
  }
  const lab=await t.newPage();
  for(const v of LOOKS) for(const s of ['light','dark']) for(const [w,h,d] of SIZES) for(const screen of ['shelf','reader']){
    const pin=pins.find(p=>p.direction===v),mode=s==='light'?'day':'night';
    await lab.setViewport({width:w,height:h,deviceScaleFactor:d});
    await lab.goto(`${t.base}design/themes-lab.html#solo=${v}/${mode}/${screen}${screen==='reader'?'/text':''}&cfg=${encodeURIComponent(JSON.stringify(pin.cfg))}`,{waitUntil:'networkidle0'});
    await sleep(600);
    await lab.screenshot({path:join(outDir,`${v}-${s}-${w}-${screen}-lab.png`)});
  }
  await lab.close();
});
