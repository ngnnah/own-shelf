import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ok,done} from './test-util.mjs';

// parse.js is a classic browser script; run it in a sandbox and pick up its globals.
const P={};vm.runInNewContext(readFileSync(new URL('./parse.js',import.meta.url),'utf8'),Object.assign(P,{TextDecoder,module:{}}));
const {firstUrl,isLoneUrl,decodeBody,mdToBlocks,finalize,parseDate}=P.module.exports;

ok('firstUrl: bare link',firstUrl('https://example.com/a?b=1')==='https://example.com/a?b=1');
ok('firstUrl: from shared text',firstUrl('Read this: “Great essay” https://example.com/x/y.html.')==='https://example.com/x/y.html');
ok('firstUrl: drops closing bracket',firstUrl('(see https://example.com/p)')==='https://example.com/p');
ok('firstUrl: none',firstUrl('no link here')===''&&firstUrl(null)==='');
ok('isLoneUrl',isLoneUrl('  https://a.com/x \n')&&!isLoneUrl('see https://a.com')&&!isLoneUrl(''));

const sjis=new Uint8Array([0x93,0xfa,0x96,0x7b]); // 日本 in Shift_JIS
ok('decodeBody: charset from header',decodeBody(sjis.buffer,'text/html; charset=Shift_JIS')==='日本');
const meta=new TextEncoder().encode('<meta charset="utf-8"><p>Tiếng Việt</p>');
ok('decodeBody: utf-8 default and meta tag',decodeBody(meta.buffer,'text/html').includes('Tiếng Việt'));
ok('decodeBody: unknown charset falls back to utf-8',decodeBody(new TextEncoder().encode('é').buffer,'text/html; charset=bogus')==='é');

const doc=finalize(mdToBlocks('# The Quiet Engine\n\nBy Ada Rivers\n\nMarch 14, 2025\n\n'+'Most great tools start as toys. '.repeat(20)+'\n\n## Why\n\n'+'Small things win. '.repeat(20)),{});
ok('finalize: title, author, date from Markdown',doc.title==='The Quiet Engine'&&doc.author==='Ada Rivers'&&doc.writtenSort==='2025-03-14');
ok('finalize: explicit title wins (link import)',finalize(mdToBlocks('## Intro\n\n'+'Words here. '.repeat(30)),{title:'From Readability'}).title==='From Readability');
ok('parseDate: ISO and long forms',parseDate('2024-03-01T10:00:00Z')==='2024-03-01'&&parseDate('July 2023')==='2023-07-01');

done();
