// A fork's Firebase setup errors: each known error names the console setting to fix and the project in config.js.
// The Firebase SDK is faked (request interception), so no test reaches Google.
// Usage: node tests/browser/setup.mjs [repo dir]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {start} from './lib.mjs';

const t=await start('setup',8143);
const {page,ok,text,until}=t;
const project=readFileSync(join(t.repo,'config.js'),'utf8').match(/projectId:\s*"([^"]+)"/)[1];

// Fake firebase-app/auth/firestore modules. window.__code is the code signInWithPopup fails with;
// sessionStorage 'fake-user' signs in at boot, and then every Firestore call fails as when no database exists.
const FAKE={
  app:`export const initializeApp=c=>({options:c});`,
  auth:`const user=()=>sessionStorage.getItem('fake-user')?{uid:'u1',email:'me@example.com'}:null;
export const getAuth=()=>({});export class GoogleAuthProvider{}
export const getRedirectResult=()=>Promise.resolve(null);
export const onAuthStateChanged=(a,cb)=>{setTimeout(()=>cb(user()));return()=>{};};
export const signInWithPopup=()=>Promise.reject(Object.assign(new Error('fake'),{code:window.__code,fake:true}));
export const signInWithRedirect=signInWithPopup;export const signOut=()=>Promise.resolve();`,
  firestore:`const err=()=>Object.assign(new Error('The database (default) does not exist for project ${project} Please visit https://console.cloud.google.com/datastore/setup?project=${project} to add a Cloud Datastore or Cloud Firestore database.'),{code:'not-found',fake:true});
const no=()=>Promise.reject(err());
export const initializeFirestore=()=>({});export const getFirestore=()=>({});
export const persistentLocalCache=()=>({});export const persistentMultipleTabManager=()=>({});
export const doc=()=>({});export const collection=()=>({});
export const getDoc=no,getDocFromCache=no,getDocs=no,getDocsFromCache=no,setDoc=no,deleteDoc=no;
export const onSnapshot=(q,next,onErr)=>{setTimeout(()=>onErr(err()));return()=>{};};`
};
// The app logs each error it shows (console.error); drop the fakes' logs so "no page errors" still checks the rest.
await page.evaluateOnNewDocument(()=>{const log=console.error;console.error=(...a)=>{if(!(a[0]&&a[0].fake))log(...a);};});
await page.setBypassServiceWorker(true); // so every request reaches the interception below
await page.setRequestInterception(true);
page.on('request',req=>{
  const m=req.url().match(/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|firestore)\.js$/);
  if(m) return req.respond({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:FAKE[m[1]]});
  req.continue();
});

await t.run(async()=>{
  await page.goto(t.base,{waitUntil:'networkidle0'});
  await page.waitForSelector('#signin:not(.hidden)',{timeout:15000});
  ok('sign-in screen with the (fake) Firebase loaded',await t.vis('#siGoogle'));

  const cases=[
    ['auth/unauthorized-domain','localhost isn’t an authorized domain'],
    ['auth/requests-from-referer-http://localhost:8143-are-blocked.','website restrictions'],
    ['auth/requests-to-this-api-identitytoolkit-method-google.cloud.identitytoolkit.v1.projectconfigservice.getprojectconfig-are-blocked.','API restrictions'],
    ['auth/operation-not-allowed','Sign-in method'],
    ['auth/configuration-not-found','Get started'],
    ['auth/api-key-not-valid.-please-pass-a-valid-api-key.','apiKey in config.js']
  ];
  for(const [code,hint] of cases){
    await page.evaluate(c=>{window.__code=c;document.querySelector('#siErr').textContent='';},code);
    await page.click('#siGoogle');
    await until(()=>document.querySelector('#siErr').textContent);
    const m=await text('#siErr');
    ok(`${code.slice(0,40)}: names the setting and the project`,m.includes(hint)&&m.includes(`“${project}”`));
  }
  await t.shot('signin-error');

  await page.evaluate(()=>{window.__code='auth/internal-error';document.querySelector('#siErr').textContent='';});
  await page.click('#siGoogle');await until(()=>document.querySelector('#siErr').textContent);
  ok('other errors keep the generic message',(await text('#siErr'))==='Sign-in didn’t work (auth/internal-error).');

  // signed in, but the project has no Firestore database
  await page.evaluate(()=>sessionStorage.setItem('fake-user','1'));
  await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('#shelf:not(.hidden)',{timeout:15000});
  ok('a missing Firestore database is named in the toast',await until(p=>document.querySelector('#toast').textContent.includes(`“${p}” has no Firestore database yet`),project));
});
