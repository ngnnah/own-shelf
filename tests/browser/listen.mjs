// Listen (read aloud), with a fake speechSynthesis in the page (headless Chrome may have no voices) that the test
// steps through start, word boundaries and end, or runs on a timer (__tts.auto). Started: the first sentence on
// screen, the sentence and word marks, Pause and Resume, moving on through blocks (heading read, code skipped),
// following the reading, stopping on leaving the reader. Still to add: see the HANDOFF note on Listen.
// Usage: node tests/browser/listen.mjs [repo dir]   (ports 8162-8163)
import {start,enterLocalMode,addMarkdown,sleep} from './lib.mjs';
const t=await start('listen',8162);
const {page,ok,must}=t;
await page.evaluateOnNewDocument(()=>{
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
    getVoices(){return [];},pause(){},resume(){}};
  T.step=()=>S.step();
  T.run=u=>{if(S.cur!==u||!T.auto) return;S.step();if(S.cur===u) setTimeout(()=>T.run(u),T.ms);else if(S.cur) setTimeout(()=>T.run(S.cur),T.ms);};
  Object.defineProperty(window,'speechSynthesis',{value:S,configurable:true});window.SpeechSynthesisUtterance=U;
});
const P=(tag,n)=>Array.from({length:n},(_,i)=>`Sentence ${tag}${i+1} talks about the sea, the wind and the long grey harbour wall.`).join(' ');
const MD=`# Listening Test\n\nBy Lee Tester\n\n${P('a',4)}\n\n## The harbour\n\n${P('b',6)}\n\n\`\`\`\nconst x = 1;\n\`\`\`\n\n${P('c',3)}\n\n`+Array.from({length:12},(_,i)=>P('d'+i+'-',5)).join('\n\n')+'\n';
const said=()=>page.evaluate(()=>__tts.said);
const mark=n=>page.evaluate(n=>{const h=CSS.highlights.get(n);return h?[...h][0].toString():null;},n);
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
});
