import {normTerm,termKey,wordId,sentenceAround,cloze,newSrs,isDue,schedule,nextLabel,parseDatamuse,parseWiktionary,baseForms,isFact,factId,factBlank,factCloze,wordsIn,snapWords,
  wikiSummaryUrl,parseWikiSummary,datamuseRelUrl,parseDatamuseWords,wikitextUrl,parseWikitext,stripWiki,findWord,cleanText,parseList,exampleLine,parseExamples,mergeExtras} from './vocab.js';
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
// fact cards
ok('wordId: unchanged by the shared hash (ids already stored stay valid)',wordId('ephemeral')==='w'+(()=>{let h=5381;for(const c of 'ephemeral')h=((h<<5)+h+c.charCodeAt(0))|0;return (h>>>0).toString(36);})());
ok('factId: one id per book and highlight, "f" first',factId('k1','h1')===factId('k1','h1')&&factId('k1','h1')!==factId('k1','h2')&&factId('k1','h1')!==factId('k2','h1')&&/^f[0-9a-z]+$/.test(factId('k1','h1')));
ok('isFact: only kind "fact"',isFact({kind:'fact'})&&!isFact({term:'calm'})&&!isFact(null));
const fact={kind:'fact',text:'Mercator drew the world flat.',blank:{s:9,e:13}};
ok('factCloze: the text around the blank, and the phrase',JSON.stringify(factCloze(fact))===JSON.stringify({before:'Mercator ',phrase:'drew',after:' the world flat.'}));
ok('factCloze: no blank, none (a re-read card)',factCloze({...fact,blank:null})===null&&factBlank({...fact,blank:null})===null);
ok('factBlank: a blank outside the text or empty is none',factBlank({...fact,blank:{s:20,e:99}})===null&&factBlank({...fact,blank:{s:4,e:4}})===null&&factBlank({...fact,blank:{s:'1',e:3}})===null&&factCloze({...fact,blank:{s:-1,e:3}})===null);
const wt='Ships & sailors don’t agree—well-known “weather”, 1890s.';
ok('wordsIn: words with inner apostrophes and hyphens, no punctuation',JSON.stringify(wordsIn(wt).map(w=>wt.slice(w.s,w.e)))===JSON.stringify(['Ships','sailors','don’t','agree','well-known','weather','1890s']));
ok('wordsIn: letters with accents and marks',JSON.stringify(wordsIn('Tiếng Việt, café.').map(w=>w.e-w.s))===JSON.stringify([5,4,4]));
const st='A squall is a sudden, violent gust of wind.',su=st.indexOf('sudden');
const sn=snapWords(st,su+2,st.indexOf('gust')+2);
ok('snapWords: a selection from inside one word to inside another takes both whole',st.slice(sn.s,sn.e)==='sudden, violent gust');
const sp=snapWords(st,su-1,su+8);
ok('snapWords: spaces and punctuation around the words are dropped',st.slice(sp.s,sp.e)==='sudden');
ok('snapWords: nothing but spaces and punctuation, or nothing selected, is no phrase',snapWords(st,su+6,su+8)===null&&snapWords(st,5,5)===null);
ok('baseForms: plural, past, -ing, -ly',baseForms('studies').includes('study')&&baseForms('ships').includes('ship')&&baseForms('walked').includes('walk')&&baseForms('making').includes('make')&&baseForms('quickly').includes('quick')&&baseForms('glass').length===0);

// pictures: Wikipedia's page summary
const sum=(title,type='standard',thumb='https://thumb.wikimedia.org/x/330px-X.jpg')=>({type,title,thumbnail:thumb?{source:thumb,width:330,height:300}:undefined,content_urls:{desktop:{page:'https://en.wikipedia.org/wiki/'+title.replace(/ /g,'_')}}});
const ws=parseWikiSummary(sum('Barometer'),'barometer');
ok('parseWikiSummary: the thumbnail and its page when the title is the word',ws&&ws.src==='https://thumb.wikimedia.org/x/330px-X.jpg'&&ws.title==='Barometer'&&ws.url==='https://en.wikipedia.org/wiki/Barometer');
ok('parseWikiSummary: any case, spaces or underscores, or a base form',!!parseWikiSummary(sum('Baltic states'),'baltic states')&&!!parseWikiSummary(sum('Baltic_states'),'Baltic States')&&!!parseWikiSummary(sum('Lighthouse'),'lighthouses'));
ok('parseWikiSummary: another title ("ephemeral" → "Ephemerality") gives none',parseWikiSummary(sum('Ephemerality'),'ephemeral')===null);
ok('parseWikiSummary: none for a disambiguation page, no thumbnail, or nothing',parseWikiSummary(sum('Mole','disambiguation'),'mole')===null&&parseWikiSummary(sum('Mole','standard',null),'mole')===null&&parseWikiSummary(null,'mole')===null&&parseWikiSummary(sum('Mole','standard','http://x/y.jpg'),'mole')===null);
ok('wikiSummaryUrl: spaces as underscores, encoded',wikiSummaryUrl(' Baltic states ')==='https://en.wikipedia.org/api/rest_v1/page/summary/Baltic_states'&&wikiSummaryUrl('sudden, violent gust')==='https://en.wikipedia.org/api/rest_v1/page/summary/sudden%2C_violent_gust');

// synonyms and antonyms: Datamuse
ok('parseDatamuseWords: up to 6 words, not the word itself, no repeats',JSON.stringify(parseDatamuseWords([{word:'transient'},{word:'ephemeral'},{word:'transitory'},{word:'transient'},{word:'fugacious'},{word:'a'},{word:'b'},{word:'c'},{word:'d'}],'Ephemeral'))===JSON.stringify(['transient','transitory','fugacious','a','b','c']));
ok('parseDatamuseWords: nothing for nothing',parseDatamuseWords([],'x').length===0&&parseDatamuseWords(null,'x').length===0);
ok('datamuseRelUrl: rel_syn and rel_ant, 6 at most',datamuseRelUrl('Ephemeral','syn')==='https://api.datamuse.com/words?rel_syn=ephemeral&max=6'&&datamuseRelUrl('x','ant').includes('rel_ant=x'));

// markup and the word's place
ok('stripWiki: bold, italics, links, {{w}}, other templates, refs',stripWiki("''An '''[[ephemeral]]''' [[w:Joy|joy]]'', said {{w|Ann Example}}{{nbsp}}<ref>x</ref> {{q|rare}}.")==='An ephemeral joy, said Ann Example .'
  &&stripWiki('{{w|Sam Writer (poet)|Sam Writer}}')==='Sam Writer'&&stripWiki('a {{...}} b [[File:x.png|thumb|y]] c &amp; d')==='a … b c & d');
ok('findWord: the word, a base form, or a word starting with it',JSON.stringify(findWord('The Ephemeral calm.','ephemeral'))==='{"s":4,"e":13}'
  &&JSON.stringify(findWord('Many ships sailed.','ships'))==='{"s":5,"e":10}'&&JSON.stringify(findWord('She studied hard.','study'))==='{"s":4,"e":11}'&&findWord('Nothing here.','ledger')===null);
ok('findWord: a whole word before a longer one ("art" in "art and artists")',JSON.stringify(findWord('Artists love art.','art'))==='{"s":13,"e":16}');

// Wiktionary wikitext: synthetic, in the markup Wiktionary uses
const WT=`{{also|Ephemeral}}
==English==
===Etymology===
From a made-up root.
===Adjective===
{{en-adj}}
# Lasting for a [[short]] period of [[time]].
#: {{syn|en|transient|fleeting<qq:literary>|short-lived#Adjective|Thesaurus:ephemeral}}
#: {{ant|en|lasting|permanent}}
#: {{ux|en|Our '''ephemeral''' joy faded by noon.}}
#* '''1821-1822''', {{w|Ann Example}}, ''A Made-up Book'', page 9:
#*: The crowd was loud. Its ephemeral cheer was gone by dark, as cheers go.
#* {{quote-book|en|year=1853|author={{w|Sam Writer (poet)|Sam Writer}}|title=Lectures
|passage=Words not of '''ephemeral''', but of lasting, worth.}}
# {{lb|en|biology}} Living for one day.
#: {{ux|en|An '''ephemeral''' fly.}}
===Noun===
# Something short-lived.
#: {{syn|en|ephemeron}}
==French==
===Adjective===
# {{ux|fr|Un mot '''éphémère'''.}}
#: {{syn|fr|bref}}`;
const px=parseWikitext({parse:{title:'ephemeral',wikitext:WT}},'ephemeral');
ok('parseWikitext: the first English sense’s synonyms and antonyms, cleaned',JSON.stringify(px.syn)===JSON.stringify(['transient','fleeting','short-lived'])&&JSON.stringify(px.ant)===JSON.stringify(['lasting','permanent']));
ok('parseWikitext: a usage example first, the word bold, no citation',px.dex.length===2&&px.dex[0].text==='Our ephemeral joy faded by noon.'&&px.dex[0].text.slice(px.dex[0].s,px.dex[0].e)==='ephemeral'&&px.dex[0].cite==='');
ok('parseWikitext: then a quotation, cut to the sentence holding the word, labelled year and author',px.dex[1].text==='Its ephemeral cheer was gone by dark, as cheers go.'&&px.dex[1].text.slice(px.dex[1].s,px.dex[1].e)==='ephemeral'&&px.dex[1].cite==='1821, Ann Example');
const q2=parseWikitext({parse:{wikitext:WT.replace(/#: \{\{ux\|en\|Our[^\n]*\n/,'').replace(/#\*: The crowd[^\n]*\n/,'#*: '+'A very long line without the word in it at all. '.repeat(2)+'\n')}},'ephemeral');
ok('parseWikitext: a quote template’s passage (over two lines), year and author; one without the word skipped',q2.dex.length===2&&q2.dex[0].text==='Words not of ephemeral, but of lasting, worth.'&&q2.dex[0].cite==='1853, Sam Writer'&&q2.dex[1].text==='An ephemeral fly.');
const lng=parseWikitext({parse:{wikitext:'==English==\n===Noun===\n# A sense.\n#: {{ux|en|'+'Some words that run on and on, '.repeat(10)+"until the '''word''' comes.}}"}},'word');
ok('parseWikitext: a sentence still very long is skipped; no nyms is none',lng.dex.length===0&&lng.syn.length===0&&lng.ant.length===0);
ok('parseWikitext: no English section, a missing page, or nothing: null',parseWikitext({parse:{wikitext:'==French==\n# x'}},'x')===null&&parseWikitext({error:{code:'missingtitle'}},'x')===null&&parseWikitext(null,'x')===null);
ok('wikitextUrl: the parse API, lower case, CORS',wikitextUrl('Ephemeral')==='https://en.wiktionary.org/w/api.php?action=parse&page=ephemeral&prop=wikitext&format=json&formatversion=2&origin=*');

// editing them as text
ok('cleanText: line breaks kept, spaces and tabs collapsed, ends trimmed',cleanText('  the baltic states\r\n• Estonia\n\t• Capital:\tTallinn  \n\n\n\nEnd ')==='the baltic states\n• Estonia\n• Capital: Tallinn\n\nEnd');
ok('parseList: commas, semicolons or lines; no repeats or blanks',JSON.stringify(parseList(' transient, transitory;\nTransient ,, fleeting  away '))===JSON.stringify(['transient','transitory','fleeting away']));
const old=[{text:'Our ephemeral joy faded.',s:4,e:13,cite:''},{text:'Its ephemeral cheer was gone.',s:4,e:13,cite:'1821, Ann Example'}];
const pe=parseExamples('Our ephemeral joy faded.\nIts ephemeral cheer was gone, mostly. — 1821, Ann Example\n\nMy own: the ephemeral calm.',old,'ephemeral');
ok('parseExamples: an unchanged line keeps its example; an edited one keeps its cite; a new one is added',pe.length===3&&pe[0]===old[0]&&pe[1].cite==='1821, Ann Example'&&pe[1].text==='Its ephemeral cheer was gone, mostly.'&&pe[2].cite===''&&pe[2].text.slice(pe[2].s,pe[2].e)==='ephemeral');
ok('exampleLine: the sentence, then its cite',exampleLine(old[1])==='Its ephemeral cheer was gone. — 1821, Ann Example'&&exampleLine(old[0])==='Our ephemeral joy faded.');
const mine={id:'w1',term:'calm',def:'still',syn:['quiet'],srs:{reps:3},tried:{muse:'calm'}};
const mx=mergeExtras(mine,{id:'w1',term:'calm',def:'other',syn:['x'],ant:['stormy'],pics:[{src:'data:image/jpeg;base64,AA'}],dex:[],tried:{wiki:'calm',muse:'other'}});
ok('mergeExtras: fills only the missing ones, keeps the rest',mx.syn[0]==='quiet'&&mx.ant[0]==='stormy'&&mx.pics.length===1&&!('dex' in mx)&&mx.def==='still'&&mx.srs.reps===3&&mx.tried.muse==='calm'&&mx.tried.wiki==='calm');
ok('mergeExtras: nothing to add is null',mergeExtras(mine,{syn:['y']})===null&&mergeExtras(mine,null)===null);

done();
