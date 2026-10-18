import {verifyToken,checkTarget,handle} from './worker.js';
import {chunkBlocks} from '../store.js';
const {subtle}=crypto;
const kp=await subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...(await subtle.exportKey('jwk',kp.publicKey)),kid:'k1'};
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
const now=Math.floor(Date.now()/1000);
async function tok(p){const h=b64({alg:'RS256',kid:'k1'}),pl=b64(p);const sig=await subtle.sign('RSASSA-PKCS1-v1_5',kp.privateKey,new TextEncoder().encode(h+'.'+pl));return h+'.'+pl+'.'+Buffer.from(sig).toString('base64url');}
const good={aud:'upwind-reader',iss:'https://securetoken.google.com/upwind-reader',sub:'u1',exp:now+600,iat:now,email:'me@x.com',email_verified:true};
const gk=async()=>[jwk];
const ok=(n,c)=>console.log(c?'PASS':'FAIL',n);
ok('valid token',(await verifyToken(await tok(good),'upwind-reader',{getKeysImpl:gk})).sub==='u1');
for(const [n,p] of [['expired',{...good,exp:now-5}],['wrong aud',{...good,aud:'x'}],['wrong iss',{...good,iss:'x'}]]){let r='ok';try{await verifyToken(await tok(p),'upwind-reader',{getKeysImpl:gk})}catch(e){r=e.message}ok('rejects '+n,r!=='ok');}
let t=await tok(good);t=t.slice(0,-4)+'AAAA';let r='ok';try{await verifyToken(t,'upwind-reader',{getKeysImpl:gk})}catch(e){r=e.message}ok('rejects bad signature',r!=='ok');
ok('blocks localhost',!!checkTarget('http://localhost/x'));ok('blocks 10.x',!!checkTarget('http://10.0.0.1/'));ok('blocks 169.254',!!checkTarget('http://169.254.169.254/'));ok('blocks ftp',!!checkTarget('ftp://a.com'));ok('allows https',checkTarget('https://paulgraham.com/greatwork.html')===null);
const env={FIREBASE_PROJECT_ID:'upwind-reader',ALLOWED_ORIGINS:'https://ngnnah.github.io',ALLOWED_EMAILS:'me@x.com'};
const mk=(o,a,u='https://example.com/a')=>new Request('https://w.dev/?url='+encodeURIComponent(u),{headers:{Origin:o,Authorization:'Bearer '+a}});
const fakeFetch=async(u)=>u.includes('/r')?new Response('',{status:302,headers:{Location:'http://127.0.0.1/'}}):new Response('<html><body>hi</body></html>',{headers:{'Content-Type':'text/html'}});
const deps={fetch:fakeFetch,getKeys:gk};
let res=await handle(mk('https://ngnnah.github.io',await tok(good)),env,deps);ok('happy path 200',res.status===200&&res.headers.get('X-Final-URL')==='https://example.com/a');
res=await handle(mk('https://evil.com',await tok(good)),env,deps);ok('wrong origin 403',res.status===403);
res=await handle(mk('https://ngnnah.github.io',await tok({...good,email:'other@x.com'})),env,deps);ok('other email 403',res.status===403);
res=await handle(mk('https://ngnnah.github.io','junk'),env,deps);ok('bad token 401',res.status===401);
res=await handle(mk('https://ngnnah.github.io',await tok(good),'https://example.com/r'),env,deps);ok('redirect to private blocked 400',res.status===400);
const big=Array.from({length:300},(_,i)=>({t:'p',text:'x'.repeat(5000),id:'b'+i}));const ch=chunkBlocks(big);
ok('chunks under 700KB',ch.every(c=>Buffer.byteLength(JSON.stringify(c))<700*1024)&&ch.flat().length===300);
