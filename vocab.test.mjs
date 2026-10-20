import {normTerm,termKey,wordId,sentenceAround,cloze,newSrs,isDue,schedule,nextLabel,parseDatamuse,parseWiktionary,baseForms} from './vocab.js';
import {ok,done} from './test-util.mjs';

ok('normTerm trims spaces and punctuation',normTerm('  “Ephemeral,” ')==='Ephemeral'&&normTerm('well-known.')==='well-known');
ok('wordId: same word, same id, any case',wordId('Ephemeral')===wordId(' ephemeral ')&&wordId('a')!==wordId('b')&&/^w[0-9a-z]+$/.test(wordId('x')));

const para='The storm passed. Its calm was ephemeral, as calms are! Ships stayed in port.';
const at=para.indexOf('ephemeral'),sa=sentenceAround(para,at,at+9);
ok('sentenceAround: the sentence holding the word',sa.text==='Its calm was ephemeral, as calms are!'&&sa.text.slice(sa.s,sa.e)==='ephemeral');
const first=sentenceAround(para,4,9);
ok('sentenceAround: first sentence, word offsets kept',first.text==='The storm passed.'&&first.text.slice(first.s,first.e)==='storm');
const last=sentenceAround(para,para.indexOf('port'),para.indexOf('port')+4);
ok('sentenceAround: last sentence without a trailing space',last.text==='Ships stayed in port.');
const long=('word '.repeat(80))+'pivotal '+('word '.repeat(80)),lp=long.indexOf('pivotal'),ls=sentenceAround(long,lp,lp+7,40);
ok('sentenceAround: long sentences cut around the word with …',ls.text.startsWith('…')&&ls.text.endsWith('…')&&ls.text.length<110&&ls.text.slice(ls.s,ls.e)==='pivotal');
ok('cloze blanks the word',cloze(sa)==='Its calm was _____, as calms are!');

const now=1e12,DAY=864e5;
let c=newSrs(now);
ok('a new card is due',isDue(c,now)&&isDue(undefined,now));
const g1=schedule(c,'good',now);ok('good on a new card: 1 day',g1.interval===1&&g1.due===now+DAY&&g1.reps===1);
const g2=schedule(g1,'good',now);ok('good again: 3 days',g2.interval===3);
const g3=schedule(g2,'good',now);ok('then interval × ease (2.5): 8 days',g3.interval===8&&!isDue(g3,now+7*DAY)&&isDue(g3,now+8*DAY));
const e1=schedule(c,'easy',now);ok('easy on a new card: 4 days, ease up',e1.interval===4&&e1.ease>2.5);
const a1=schedule(g3,'again',now);ok('again: 10 minutes, back to the start, ease down, a lapse',a1.due===now+600000&&a1.reps===0&&a1.ease<g3.ease&&a1.lapses===1);
ok('ease never drops below 1.3',[...Array(10)].reduce(s=>schedule(s,'again',now),g3).ease===1.3);
ok('nextLabel: 10 min / 1 day / 4 days',nextLabel(c,'again',now)==='10 min'&&nextLabel(c,'good',now)==='1 day'&&nextLabel(c,'easy',now)==='4 days');

const dm=parseDatamuse([{word:'ephemeral',defs:['adj\tLasting for a short period of time. ','n\tSomething which lasts for a short period of time. ']}]);
ok('parseDatamuse: first definition and its part of speech',dm.def==='Lasting for a short period of time.'&&dm.pos==='adjective'&&dm.more.length===1&&dm.defSource==='Datamuse');
ok('parseDatamuse: nothing for unknown words',parseDatamuse([])===null&&parseDatamuse([{word:'x'}])===null);
const wk=parseWiktionary({en:[{partOfSpeech:'Adjective',definitions:[{definition:'Lasting for a <a href="/wiki/short">short</a> period of time.'},{definition:'<span></span>Existing for one day &amp; no more.'}]}]});
ok('parseWiktionary: HTML stripped, entities decoded',wk.def==='Lasting for a short period of time.'&&wk.pos==='adjective'&&wk.more[0]==='Existing for one day & no more.');
ok('parseWiktionary: nothing without English entries',parseWiktionary({fr:[]})===null&&parseWiktionary(null)===null);
ok('baseForms: plural, past, -ing, -ly',baseForms('studies').includes('study')&&baseForms('ships').includes('ship')&&baseForms('walked').includes('walk')&&baseForms('making').includes('make')&&baseForms('quickly').includes('quick')&&baseForms('glass').length===0);

done();
