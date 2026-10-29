// Listen (read aloud), with a fake speechSynthesis in the page (headless Chrome may have no voices) that the test
// steps through start, word boundaries and end, or runs on a timer (__tts.auto). Checks: the first sentence on
// screen, the sentence and word marks, Pause and Resume, moving on through blocks (heading read, code skipped),
// following the reading, stopping on leaving the reader; the speed from Settings; starting at a selection that begins
// mid-paragraph and mid-word; stored highlights and the text's DOM unchanged (a sentence marked across a highlight),
// and highlighting the paused sentence keeping its mark; Resume starting from the screen once the paused sentence has
// left it, at the first sentence whose top is on screen, with no cancel() just before it speaks;
// holding off following for 4 s after a wheel scroll; the sentence read staying bright in Focus mode; the 2 s check
// (a lost end moves on, a lost start pauses); opening another book stopping it; hidden without speechSynthesis; the
// whole-block fallback without window.Highlight.
// Usage: node tests/browser/listen.mjs [repo dir]   (port 8162)
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
const t=await start('listen',8162);
const {page,ok,must}=t;
// The fake engine: speak() queues, step() fires start, then a boundary per word, then end (and speaks the next);
// __tts.auto steps on a timer every __tts.ms. Records what was said, at what rate, and the cancels.
const fakeTTS=()=>{
  const T=window.__tts={said:[],rates:[],cancels:0,auto:false,ms:30};
  class U{constructor(text){this.text=text;this.rate=1;}}
  const fire=(u,type,o={})=>{const ev=Object.assign(new Event(type),o);u['on'+type]&&u['on'+type](ev);};
  const S={speaking:false,pending:false,cur:null,q:[],k:-1,
    speak(u){this.q.push(u);if(!this.cur) this.next();this.pending=this.q.length>0;},
    cancel(){T.cancels++;const c=this.cur;this.cur=null;this.q=[];this.speaking=this.pending=false;if(c) fire(c,'error',{error:'interrupted'});},
    next(){const u=this.q.shift();this.pending=this.q.length>0;this.cur=u||null;this.speaking=!!u;this.k=-1;if(u){T.said.push(u.text);T.rates.push(u.rate);if(T.auto) setTimeout(()=>T.run(u),T.ms);}},
    step(){const u=this.cur;if(!u) return;const ws=[...u.text.matchAll(/\S+/g)];
      if(this.k<0) fire(u,'start');else if(this.k<ws.length) fire(u,'boundary',{name:'word',charIndex:ws[this.k].index,charLength:ws[this.k][0].length});
      else{this.cur=null;this.speaking=false;fire(u,'end');if(!this.cur) this.next();return;}
      this.k++;},
    // the engine drops the utterance without an end event (Safari) or before it starts (iOS cutting speech off)
    lose(){this.cur=null;this.speaking=this.pending=false;},
    getVoices(){return [];},pause(){},resume(){}};
  T.step=()=>S.step();
  T.run=u=>{if(S.cur!==u||!T.auto) return;S.step();if(S.cur===u) setTimeout(()=>T.run(u),T.ms);else if(S.cur) setTimeout(()=>T.run(S.cur),T.ms);};
  T.go=()=>{T.auto=true;if(S.cur) T.run(S.cur);};
  Object.defineProperty(window,'speechSynthesis',{value:S,configurable:true});window.SpeechSynthesisUtterance=U;
};
// Page helpers: the reader's block holding a text, and a selection or a box by offsets into a block's text.
const helpers=()=>{
  window.__blk=txt=>[...document.querySelectorAll('#col .hp[data-pid]')].find(e=>e.textContent.includes(txt));
  window.__pt=(el,off)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){if(off<=n.length) return [n,off];off-=n.length;}return [el,el.childNodes.length];};
  window.__range=(el,s,e)=>{const r=document.createRange();r.setStart(...__pt(el,s));r.setEnd(...__pt(el,e));return r;};
  window.__select=(el,s,e)=>{getSelection().removeAllRanges();getSelection().addRange(__range(el,s,e));};
};
await page.evaluateOnNewDocument(fakeTTS);await page.evaluateOnNewDocument(helpers);
const P=(tag,n)=>Array.from({length:n},(_,i)=>`Sentence ${tag}${i+1} talks about the sea, the wind and the long grey harbour wall.`).join(' ');
const MD=`# Listening Test\n\nBy Lee Tester\n\n${P('a',4)}\n\n## The harbour\n\n${P('b',6)}\n\n\`\`\`\nconst x = 1;\n\`\`\`\n\n${P('c',3)}\n\n`+Array.from({length:16},(_,i)=>P('d'+i+'-',5)).join('\n\n')+'\n';
const MD2=`# Second Book\n\nBy Ann Other\n\n${P('e',3)}\n\n${P('f',3)}\n\n${P('g',3)}\n`;
let p=page;
const said=()=>p.evaluate(()=>__tts.said);
const last=async()=>(await said()).at(-1)||'';
const mark=n=>p.evaluate(n=>{const h=CSS.highlights.get(n);return h?[...h][0].toString():null;},n);
const state=()=>p.$eval('#bListen',b=>b.dataset.ls);
const waitFor=(fn,ms,...a)=>p.waitForFunction(fn,{timeout:ms},...a).then(()=>true,()=>false);
// the stored highlights of the open book, from IndexedDB
const storedHl=()=>p.evaluate(()=>new Promise((res,rej)=>{
  const id=JSON.parse(localStorage.getItem('upwind:last')),r=indexedDB.open('upwind',1);r.onerror=()=>rej(r.error);
  r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get('state:'+id);g.onsuccess=()=>{r.result.close();res(JSON.stringify((g.result||{}).hl||[]));};};
}));
await t.run(async()=>{
  await enterLocalMode(t,must);
  await addMarkdown(t,'listen.md',MD,'Listening Test');
  ok('Listen shown',await t.vis('#bListen'));
  await page.click('#bListen');
  const s0=(await said())[0]||'';
  ok('starts at the first sentence on screen: '+s0.slice(0,40),s0.startsWith('Sentence a1'));
  ok('button says Pause',await page.$eval('#bListen',b=>b.dataset.ls==='on'&&b.getAttribute('aria-label')==='Pause'));
  ok('sentence marked',(await mark('listen'))===s0);
  await page.evaluate(()=>{__tts.step();__tts.step();__tts.step();});
  ok('word marked: '+await mark('listen-word'),(await mark('listen-word'))==='a1');
  await page.click('#bListen');
  ok('paused: Resume, word mark gone, sentence kept',await page.$eval('#bListen',b=>b.dataset.ls==='paused')&&(await mark('listen-word'))===null&&(await mark('listen'))===s0);
  await page.click('#bListen');
  ok('resume says the sentence again',(await said()).at(-1)===s0);
  await page.evaluate(()=>{__tts.auto=true;__tts.run(speechSynthesis.cur);});
  await t.until(()=>__tts.said.some(s=>s.startsWith('Sentence c1')));
  const all=await said();
  ok('reads on through blocks, heading included, code skipped',all.includes('The harbour')&&!all.some(s=>s.includes('const x')));
  await page.evaluate(()=>{__tts.ms=80;});
  const y0=await page.evaluate(()=>scrollY);
  await t.until(()=>__tts.said.some(s=>s.startsWith('Sentence d3-')));
  ok('follows: the page scrolled '+(await page.evaluate(()=>scrollY))+' from '+y0,(await page.evaluate(()=>scrollY))>y0+200);
  await page.click('#bHome');await sleep(100);
  ok('leaving the reader stops it',!(await page.evaluate(()=>speechSynthesis.speaking))&&(await mark('listen'))===null);
  await t.shot('end');
  await page.evaluate(()=>{__tts.auto=false;__tts.ms=30;});

  /* the speed, in Settings, per device */
  await page.click('#setBtn');await page.waitForSelector('#setM:not(.hidden)');
  ok('Settings shows Listen speed at 1×',await t.vis('#sListen')&&await page.$eval('#sRate [data-r="1"]',b=>b.getAttribute('aria-pressed')==='true'));
  await page.click('#sRate [data-r="1.5"]');
  ok('1.5× picked',await page.$eval('#sRate',g=>[...g.querySelectorAll('[aria-pressed="true"]')].map(b=>b.dataset.r).join()==='1.5'));
  await page.keyboard.press('Escape');await page.waitForSelector('#setM.hidden');
  ok('kept on this device (prefs.rate)',await page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:prefs')).rate===1.5));
  await page.click('[data-open]');await t.reader();

  /* a selection that starts mid-paragraph, mid-word */
  await page.evaluate(()=>{const el=__blk('Sentence b3 ');el.scrollIntoView({block:'center'});const x=el.textContent,s=x.indexOf('harbour',x.indexOf('Sentence b3 '))+3;__select(el,s,s+12);});
  await t.until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.click('#bListen');
  ok('starts at the selection, from the start of its word: '+await last(),await last()==='harbour wall.'&&(await mark('listen'))==='harbour wall.');
  ok('the selection and the toolbar are cleared',await page.evaluate(()=>getSelection().isCollapsed&&document.querySelector('#tool').classList.contains('hidden')));
  ok('speaks at the speed from Settings',(await page.evaluate(()=>__tts.rates.at(-1)))===1.5);
  await page.evaluate(()=>{for(let i=0;i<4;i++) __tts.step();});
  ok('then the next sentence: '+(await last()).slice(0,12),(await last()).startsWith('Sentence b4 '));

  /* stored highlights and the text's DOM stay as they were */
  await page.click('#bListen');
  await page.evaluate(()=>{const el=__blk('Sentence c2 ');el.scrollIntoView({block:'center'});const x=el.textContent,s=x.indexOf('the sea',x.indexOf('Sentence c2 '));__select(el,s,s+'the sea, the wind'.length);});
  await t.until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.click('#tool [data-c="mint"]');
  await t.until(()=>document.querySelector('#hlCount').textContent==='1');
  await waitFor(()=>new Promise(res=>{const id=JSON.parse(localStorage.getItem('upwind:last')),r=indexedDB.open('upwind',1);r.onsuccess=()=>{const g=r.result.transaction('kv').objectStore('kv').get('state:'+id);g.onsuccess=()=>{r.result.close();res(((g.result||{}).hl||[]).length===1);};};}),5000);
  const hl0=await storedHl(),dom0=await page.evaluate(()=>__blk('Sentence c2 ').innerHTML);
  ok('a highlight to read across',JSON.parse(hl0).length===1&&dom0.includes('<mark'));
  await page.evaluate(()=>{const el=__blk('Sentence c1 '),x=el.textContent,s=x.indexOf('Sentence c1 ');__select(el,s,s+8);});
  await t.until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.click('#bListen');
  await page.evaluate(()=>{for(let i=0;i<40&&!__tts.said.at(-1).startsWith('Sentence c2 ');i++) __tts.step();for(let i=0;i<7;i++) __tts.step();});
  const c2=await last();
  ok('the sentence is marked across the highlight',c2.startsWith('Sentence c2 ')&&(await mark('listen'))===c2);
  ok('and a word inside it: '+await mark('listen-word'),(await mark('listen-word'))==='sea');
  await page.evaluate(()=>{for(let i=0;i<60&&!__tts.said.at(-1).startsWith('Sentence d0-');i++) __tts.step();});
  await page.click('#bListen');await sleep(300);
  ok('the highlighted block\'s DOM is unchanged',(await page.evaluate(()=>__blk('Sentence c2 ').innerHTML))===dom0);
  ok('stored highlights unchanged',(await storedHl())===hl0&&(await page.$$('mark.hl')).length===1);
  const d0=await last();
  await page.evaluate(()=>{const el=__blk('Sentence d0-1 ');el.scrollIntoView({block:'center'});const x=el.textContent,s=x.indexOf('the long grey');__select(el,s,s+13);});
  await t.until(()=>!document.querySelector('#tool').classList.contains('hidden'));
  await page.click('#tool [data-c="sky"]');await t.until(()=>document.querySelector('#hlCount').textContent==='2');
  ok('highlighting the paused sentence keeps its mark',d0.startsWith('Sentence d0-1 ')&&(await mark('listen'))===d0);

  /* Resume once the paused sentence has left the screen: the first sentence whose top is on screen */
  await page.evaluate(()=>{const el=__blk('Sentence d5-1 '),bar=document.querySelector('#bar').getBoundingClientRect().bottom;scrollTo(0,scrollY+el.getBoundingClientRect().top-bar+30);});
  await sleep(100);
  const cancels0=await page.evaluate(()=>__tts.cancels);
  await page.click('#bListen');
  // WebKit can drop the events of an utterance spoken right after cancel() (bug 238189): a paused Listen has nothing to cancel
  ok('Resume from the screen speaks without a cancel() first',(await page.evaluate(()=>__tts.cancels))===cancels0);
  const d5=await last(),where=await page.evaluate(s=>{
    const el=__blk(s),x=el.textContent,i=x.indexOf(s),bar=document.querySelector('#bar').getBoundingClientRect().bottom;
    const prev=x.lastIndexOf('Sentence ',i-1);
    return {top:__range(el,i,i+s.length).getBoundingClientRect().top-bar,prevTop:prev<0?null:__range(el,prev,i).getBoundingClientRect().top-bar};
  },d5);
  ok(`Resume off screen starts from the screen: ${d5.slice(0,13)} (${Math.round(where.top)} px under the bar)`,d5.startsWith('Sentence d5-')&&!d5.startsWith('Sentence d5-1 ')&&where.top>=-2);
  ok(`  the one before it starts under the bar (${Math.round(where.prevTop)} px)`,where.prevTop!=null&&where.prevTop<-2);
  ok('  and it is marked',(await mark('listen'))===d5&&await state()==='on');

  /* following holds off for 4 s after a wheel scroll */
  await page.evaluate(()=>{__tts.ms=25;__tts.go();});
  await t.until(()=>__tts.said.at(-1).startsWith('Sentence d6-'));
  // wheel just after a follow has scrolled and settled, so no smooth scroll of the app's is still under way
  const yf=await page.evaluate(()=>scrollY);await waitFor(y=>scrollY!==y,8000,yf);
  await page.evaluate(()=>new Promise(res=>{let tm;const on=()=>{clearTimeout(tm);tm=setTimeout(()=>{removeEventListener('scroll',on);res();},300);};addEventListener('scroll',on,{passive:true});on();}));
  await page.mouse.move(200,500);await page.mouse.wheel({deltaY:-900});
  const wheelAt=Date.now();await sleep(400);
  const y1=await page.evaluate(()=>scrollY),n1=(await said()).length;
  await waitFor(n=>__tts.said.length>=n+4,3000,n1);
  const y2=await page.evaluate(()=>scrollY),below=await page.evaluate(()=>Math.round(document.querySelector('#col .ls-block').getBoundingClientRect().top-innerHeight));
  ok(`after a wheel scroll, the page stays put while reading goes on below the screen (${(await said()).length-n1} sentences, ${y1}→${y2}, ${below} px below)`,y2===y1&&(await said()).length>=n1+4&&below>-150);
  const back=await waitFor(y=>scrollY!==y,7000,y1),after=Date.now()-wheelAt;
  ok(`and follows again about 4 s after it (${after} ms)`,back&&after>=3800&&after<6500);

  /* Focus mode: the block being read stays bright, even away from the middle of the screen */
  await page.click('#bListen');await page.evaluate(()=>{__tts.auto=false;});
  ok('paused',await state()==='paused');
  await page.click('#bFocus');
  await page.evaluate(()=>{const el=document.querySelector('#col .ls-block');scrollTo(0,scrollY+el.getBoundingClientRect().bottom-140);});
  const bright=await waitFor(()=>{
    const b=document.querySelector('#col .hp.ls-block'),lit=document.querySelector('#col .hp.lit'),o=[...document.querySelectorAll('#col .hp')].find(x=>x!==b&&x!==lit);
    return b&&lit&&b!==lit&&o&&getComputedStyle(b).opacity==='1'&&getComputedStyle(lit).opacity==='1'&&getComputedStyle(o).opacity==='0.28';
  },3000);
  ok('Focus mode: the block being read stays bright beside the lit one',bright);
  await page.click('#bFocus');

  /* the 2 s check: an end that never comes moves on; a start that never comes pauses */
  await page.click('#bListen');
  const r0=await last(),n2=(await said()).length;
  await page.evaluate(()=>{__tts.step();__tts.step();speechSynthesis.lose();});
  const moved=await waitFor(n=>__tts.said.length>n,6000,n2);
  ok(`a lost end moves on to the next sentence: ${(await last()).slice(0,13)} after ${r0.slice(0,13)}`,moved&&await last()!==r0&&await state()==='on');
  const n3=(await said()).length;
  await page.evaluate(()=>speechSynthesis.lose());
  const stopped=await waitFor(()=>document.querySelector('#bListen').dataset.ls==='paused',6000);
  ok('a lost start pauses, with a toast',stopped&&(await t.text('#toast')).includes('tap Resume')&&(await said()).length===n3);

  /* opening another book stops it */
  await page.click('#bListen');
  ok('resumed',await state()==='on'&&await page.evaluate(()=>speechSynthesis.speaking));
  const cancels=await page.evaluate(()=>__tts.cancels);
  await page.evaluate(md=>{const dt=new DataTransfer();dt.items.add(new File([md],'second.md',{type:'text/markdown'}));document.body.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));},MD2);
  await page.waitForSelector('#importM:not(.hidden)');
  await t.until(()=>document.querySelector('#det').textContent.includes('Second Book'));
  await page.click('#impGo');
  await t.until(()=>document.querySelector('.hero h1').textContent.includes('Second'));await t.reader();
  ok('another book stops it',await state()===''&&!(await page.evaluate(()=>speechSynthesis.speaking))&&(await page.evaluate(()=>__tts.cancels))>cancels&&(await mark('listen'))===null&&!(await page.$('#col .ls-block')));
  await page.click('#bListen');
  ok('Listen there reads the new book: '+(await last()).slice(0,13),(await last()).startsWith('Sentence e1 '));
  await page.click('#bHome');await page.waitForSelector('#shelf:not(.hidden)');

  /* no speechSynthesis: no Listen button, no speed setting */
  const q=p=t.page=await t.newPage();
  await q.evaluateOnNewDocument(()=>{Object.defineProperty(window,'speechSynthesis',{value:undefined,configurable:true});window.SpeechSynthesisUtterance=undefined;});
  await q.goto(t.base,{waitUntil:'networkidle0'});await q.waitForSelector('#shelf:not(.hidden)');
  await q.click('#setBtn');await q.waitForSelector('#setM:not(.hidden)');
  ok('without speechSynthesis Settings has no Listen speed',!(await t.vis('#sListen',q)));
  await q.keyboard.press('Escape');await q.waitForSelector('#setM.hidden');
  await q.click('.cover[aria-label^="Second Book"]');await t.reader(q);
  ok('  and the bar has no Listen',!(await t.vis('#bListen',q))&&await t.vis('#bToc',q));
  await q.click('#bHome');await q.waitForSelector('#shelf:not(.hidden)');await q.close();

  /* no window.Highlight: the whole block is marked */
  const f=p=t.page=await t.newPage();
  await f.evaluateOnNewDocument(fakeTTS);await f.evaluateOnNewDocument(helpers);await f.evaluateOnNewDocument(()=>{delete window.Highlight;});
  await f.goto(t.base,{waitUntil:'networkidle0'});await f.waitForSelector('#shelf:not(.hidden)');
  await f.click('.cover[aria-label^="Second Book"]');await t.reader(f);
  await f.click('#bListen');
  const blk=()=>f.evaluate(()=>[...document.querySelectorAll('#col .ls-block')].map(e=>(e.classList.contains('ls-whole')?'whole ':'')+e.textContent.slice(0,11)));
  ok('without Highlight: the block is marked whole, no custom highlight: '+await blk(),(await blk()).join()==='whole Sentence e1'&&(await f.evaluate(()=>!CSS.highlights.has('listen'))));
  await f.evaluate(()=>{for(let i=0;i<60&&!__tts.said.at(-1).startsWith('Sentence f1 ');i++) __tts.step();});
  ok('  moving on to the next block moves the mark: '+await blk(),(await blk()).join()==='whole Sentence f1');
  await f.click('#bListen');
  ok('  Pause keeps it',(await blk()).join()==='whole Sentence f1');
  await f.click('#bHome');await f.waitForSelector('#shelf:not(.hidden)');
  ok('  leaving the reader clears it',!(await f.$('.ls-block,.ls-whole')));
  await t.shot('fallback');
});
