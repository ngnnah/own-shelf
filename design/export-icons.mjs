// Redraws every file in icons/ from the arm lab (arm-lab.html) and the icon's settings (icon.json).
// Run: npm run icons. Needs Google Chrome; set CHROME_PATH if it isn't in /Applications.
//
// The lab draws the icon into fixed slots of its "Where it lives" panel. This opens it from disk with
// icon.json injected through localStorage, once per mark radius, and copies the drawings out. SVGs are saved
// as drawn; PNGs are the same drawings rendered by Chrome at their exact pixel size.
import puppeteer from 'puppeteer-core';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url)),out=join(here,'..','icons');
const CHROME=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const cfg=JSON.parse(readFileSync(join(here,'icon.json'),'utf8'));
const KEY='own-shelf-arm-lab';

// Lab slots: full-detail parchment tile, simplified parchment tile (≤ 48 px), bare mark, simplified bare mark.
const TILE='.sz180',TILE_S='.sz32',MARK='.slotHero',MARK_S='.slotBrand';
// fit = the mark's radius in tile units (the tile's half-size is 50). 39 keeps it inside Android's
// maskable safe circle (radius 40). SVGs are saved at 512 px; they scale.
const ICONS=[
  {file:'mark.svg',slot:MARK,fit:46},
  {file:'mark-small.svg',slot:MARK_S,fit:46},
  {file:'icon.svg',slot:TILE_S,fit:44}, // favicon
  {file:'icon-192.png',slot:TILE,fit:44,px:192},
  {file:'icon-512.png',slot:TILE,fit:44,px:512},
  {file:'apple-touch-icon.png',slot:TILE,fit:44,px:180}, // opaque, square corners: iOS rounds them
  {file:'icon-maskable-512.png',slot:TILE,fit:39,px:512},
];

// The lab's <svg> carries its slot size and an inline style; a standalone file needs xmlns and its own size.
const HEAD=/^<svg width="[\d.]+" height="[\d.]+" viewBox="-50 -50 100 100" style="[^"]*">/;
function standalone(svg,px){
  const s=svg.replace(HEAD,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100" width="${px}" height="${px}">`);
  if(s===svg)throw new Error('unexpected <svg> header from the lab: '+svg.slice(0,120));
  return s;
}

const browser=await puppeteer.launch({executablePath:CHROME,headless:true});
try{
  const drawn=new Map(); // `${slot}@${fit}` -> the lab's <svg> markup
  for(const fit of new Set(ICONS.map(i=>i.fit))){
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    // The lab's web fonts style its controls only, not the drawing: stay offline.
    await page.setRequestInterception(true);
    page.on('request',r=>/^https?:/.test(r.url())?r.abort():r.continue());
    // simplify: the small slots get the simplified drawing, whatever icon.json says.
    const c={...cfg,fit,simplify:true};
    await page.evaluateOnNewDocument((key,c)=>{
      localStorage.setItem(key+':cfg',JSON.stringify(c));
      localStorage.setItem(key+':preset',JSON.stringify('Library Arm, refined'));
      localStorage.setItem(key+':state',JSON.stringify('parch'));
    },KEY,c);
    await page.goto(pathToFileURL(join(here,'arm-lab.html')).href);
    for(const i of ICONS.filter(i=>i.fit===fit)){
      const el=await page.waitForSelector(i.slot+' svg',{timeout:10000});
      drawn.set(`${i.slot}@${fit}`,await el.evaluate(s=>s.outerHTML));
    }
    // The lab saves the config it drew with: every setting must be ours, or it ignored some of them.
    const used=await page.evaluate(key=>JSON.parse(localStorage.getItem(key+':cfg')),KEY);
    const off=Object.keys(c).filter(k=>JSON.stringify(used[k])!==JSON.stringify(c[k]));
    if(off.length)throw new Error('the lab did not use these settings: '+off.join(', '));
    if(errors.length)throw new Error('lab errors: '+errors.join('; '));
    await page.close();
  }

  const page=await browser.newPage();
  for(const i of ICONS){
    const svg=drawn.get(`${i.slot}@${i.fit}`),path=join(out,i.file);
    if(!i.px){writeFileSync(path,standalone(svg,512));}
    else{
      await page.setViewport({width:i.px,height:i.px,deviceScaleFactor:1});
      await page.setContent(`<!doctype html><style>html,body{margin:0}svg{display:block}</style>${standalone(svg,i.px)}`);
      await page.screenshot({path,clip:{x:0,y:0,width:i.px,height:i.px}});
    }
    console.log(`icons/${i.file}`.padEnd(28),`fit ${i.fit}`,i.px?`${i.px} px`:'');
  }
}finally{await browser.close();}
