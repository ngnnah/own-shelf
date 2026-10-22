// Google sign-in's choices, without Google: the Firebase SDK modules are stubbed (request interception), and
// so is config.js's authDomain where a check needs the sign-in helper on this site. Covers popup or redirect in
// a browser tab, the iPhone home-screen app (an iOS user agent with navigator.standalone or display-mode
// standalone; installed desktop apps keep the popup), the message for each failure, a redirect that comes back without an account (reported once),
// and local mode. Usage: node tests/browser/signin.mjs [repo dir]
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {start} from './lib.mjs';

const t=await start('signin',8144);
const {ok,vis,text,until}=t;
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// The stub reads its behaviour from sessionStorage['stub'] when called and logs each call in window.__authCalls.
// {popup: error} makes signInWithPopup throw it; {result: error} makes getRedirectResult throw it; {delay: ms}
// holds getRedirectResult back, so its message lands after the sign-in screen opens.
const STUB={
  app:'export const initializeApp=c=>({options:c});',
  firestore:'export const initializeFirestore=()=>({}),persistentLocalCache=()=>({}),persistentMultipleTabManager=()=>({}),getFirestore=()=>({});',
  auth:`const S=()=>JSON.parse(sessionStorage.getItem('stub')||'{}');
const calls=window.__authCalls=[];
const fail=e=>Object.assign(new Error(e.message||e.code),e);
export const getAuth=()=>({currentUser:null});
export class GoogleAuthProvider{}
export async function signInWithPopup(){calls.push('popup');const s=S();if(s.popup)throw fail(s.popup);return new Promise(()=>{});}
export async function signInWithRedirect(){calls.push('redirect');return new Promise(()=>{});}
export async function getRedirectResult(){calls.push('result');const s=S();if(s.delay)await new Promise(r=>setTimeout(r,s.delay));if(s.result)throw fail(s.result);return null;}
export function onAuthStateChanged(a,cb){setTimeout(()=>cb(null));return()=>{};}
export async function signOut(){}`
};
const SDK=/^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|firestore)\.js$/;
const CONFIG=readFileSync(join(t.repo,'config.js'),'utf8');

// A fresh page on empty storage. here: config.js's authDomain is this site (the helper is self-hosted).
// standalone: navigator.standalone is true. displayMode: matchMedia('(display-mode: standalone)') matches.
async function open({ua,standalone,displayMode,here}={}){
  await t.page.close();
  const p=t.page=await t.newPage();
  await p.setBypassServiceWorker(true); // so every request reaches the interception below
  await p.setRequestInterception(true);
  p.on('request',r=>{
    const u=r.url(),m=u.match(SDK);
    if(m) return r.respond({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:STUB[m[1]]});
    if(here&&u===t.base+'config.js') return r.respond({status:200,contentType:'text/javascript',body:CONFIG.replace(/^(\s*authDomain: )"[^"]*"/m,`$1"localhost:${t.port}"`)});
    r.continue();
  });
  if(ua) await p.setUserAgent(ua);
  await p.evaluateOnNewDocument((standalone,displayMode)=>{
    if(standalone) Object.defineProperty(Navigator.prototype,'standalone',{get:()=>true,configurable:true});
    if(displayMode){const mm=matchMedia.bind(window);window.matchMedia=q=>/display-mode:\s*standalone/.test(q)?{matches:true,media:q,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent:()=>false}:mm(q);}
  },!!standalone,!!displayMode);
  // clear storage from a page of the site that isn't the app, so no boot sees it change halfway
  await p.goto(t.base+'manifest.webmanifest');await p.evaluate(()=>{localStorage.clear();sessionStorage.clear();});
  await p.goto(t.base,{waitUntil:'networkidle0'});await p.waitForSelector('#signin:not(.hidden)',{timeout:15000});
  return p;
}
async function signinScreen(){await t.page.reload({waitUntil:'networkidle0'});await t.page.waitForSelector('#signin:not(.hidden)',{timeout:15000});}
const stub=s=>t.page.evaluate(s=>sessionStorage.setItem('stub',JSON.stringify(s)),s);
const calls=()=>t.page.evaluate(()=>window.__authCalls.join(','));
const marker=()=>t.page.evaluate(()=>JSON.parse(localStorage.getItem('upwind:redirectAt'))); // when a redirect left, or null
const siErr=async()=>await vis('#siErr')?text('#siErr'):'';
const waitErr=(sel,part)=>until((sel,part)=>!document.querySelector(sel).classList.contains('hidden')&&document.querySelector(sel).textContent.includes(part),sel,part);
const here=`localhost:${t.port}/`;

await t.run(async()=>{
  // a browser tab; the helper is on Firebase's domain (today's config)
  await open();
  ok('tab: sign-in screen with the Google button',await vis('#siGoogle')&&!(await vis('#siErr')));
  await stub({popup:{code:'auth/popup-closed-by-user'}});
  await t.page.click('#siGoogle');await until(()=>window.__authCalls.includes('popup'));await t.page.evaluate(()=>new Promise(r=>setTimeout(r,100)));
  ok('tab: Google button opens a popup',(await calls())==='result,popup');
  ok('tab: closing the popup shows no message',!(await vis('#siErr')));
  await stub({popup:{code:'auth/popup-blocked'}});
  await t.page.click('#siGoogle');await waitErr('#siErr','pop-ups');
  ok('tab: a blocked popup asks to allow pop-ups',(await siErr()).includes('Allow pop-ups for this site'));
  ok('tab: a blocked popup doesn’t redirect while the helper is on another site',!(await calls()).includes('redirect')&&!(await marker()));

  // local mode still works, and its Settings shows a sign-in problem
  await t.page.click('#siLocal');await t.page.waitForSelector('#shelf:not(.hidden)');
  ok('local mode opens the empty shelf',(await text('#shelfBody')).includes('An empty shelf'));
  await t.page.click('#setBtn');await t.page.waitForSelector('#setM:not(.hidden)');
  await t.page.click('#signIn');await waitErr('#setErr','pop-ups');
  ok('local mode: a sign-in problem shows in Settings',await vis('#setM')&&(await text('#setErr')).includes('Allow pop-ups'));
  await t.page.keyboard.press('Escape');

  // a browser tab; the helper on this site: a blocked popup falls back to redirect
  await open({here:true});
  await stub({popup:{code:'auth/popup-blocked'}});
  await t.page.click('#siGoogle');await until(()=>window.__authCalls.includes('redirect'));
  ok('tab, helper here: a blocked popup falls back to redirect',(await calls())==='result,popup,redirect'&&!!(await marker()));
  await stub({});await signinScreen(); // the redirect comes back without an account
  ok('tab: a redirect back without an account says so',(await siErr())==='Google sign-in didn’t finish. Try again.');
  ok('tab: the redirect marker is cleared',!(await marker()));
  await signinScreen();
  ok('tab: reported once, not on the next load',!(await vis('#siErr')));

  // the iPhone home-screen app; the helper on Firebase's domain: no flow can finish, so none starts
  await open({ua:IPHONE,standalone:true});
  ok('home screen: no message before a tap',!(await vis('#siErr')));
  await t.page.click('#siGoogle');await waitErr('#siErr','home-screen');
  const msg=await siErr();
  ok('home screen: explains and points to Safari',msg.startsWith('Google sign-in doesn’t work in the home-screen app yet.')&&msg.includes(`Open ${here} in Safari and sign in there`)&&msg.includes('on this device only'));
  ok('home screen: starts no popup or redirect',(await calls())==='result'&&!(await marker()));
  await t.shot('home-screen');
  await t.page.click('#siLocal');await t.page.waitForSelector('#shelf:not(.hidden)');
  await t.page.click('#setBtn');await t.page.waitForSelector('#setM:not(.hidden)');
  await t.page.click('#signIn');await waitErr('#setErr','home-screen');
  ok('home screen, local mode: Settings shows the Safari workaround',await vis('#setM')&&(await text('#setErr')).includes('in Safari'));
  await t.page.keyboard.press('Escape');

  // the home-screen app found by display-mode alone (an iOS user agent, no navigator.standalone)
  await open({ua:IPHONE,displayMode:true});
  await t.page.click('#siGoogle');await waitErr('#siErr','home-screen');
  ok('home screen by display-mode: the same message, no popup',(await calls())==='result'&&(await siErr()).includes('in Safari'));

  // installed desktop apps are not the iPhone home-screen app: they keep the popup
  // (headless Chrome's user agent says Macintosh, with no touch points, like a Mac "Add to Dock" web app)
  await open({displayMode:true});
  await stub({popup:{code:'auth/popup-closed-by-user'}});
  await t.page.click('#siGoogle');await until(()=>window.__authCalls.includes('popup'));
  ok('installed desktop app: still a popup',(await calls())==='result,popup');
  await open({standalone:true});
  await stub({popup:{code:'auth/popup-closed-by-user'}});
  await t.page.click('#siGoogle');await until(()=>window.__authCalls.includes('popup'));
  ok('Mac web app (navigator.standalone, no touch): still a popup',(await calls())==='result,popup');

  // the home-screen app with the helper on this site: redirect, never a popup
  await open({ua:IPHONE,standalone:true,here:true});
  await t.page.click('#siGoogle');await until(()=>window.__authCalls.includes('redirect'));
  ok('home screen, helper here: redirects, no popup',(await calls())==='result,redirect'&&!!(await marker()));
  const missing={code:'auth/bad-request',message:'Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared.'};
  await stub({result:missing,delay:300});await signinScreen(); // its message arrives after the sign-in screen opens
  await waitErr('#siErr','home-screen');
  ok('home screen: a redirect error explains and points to Safari',(await siErr())===`Google sign-in didn’t finish in the home-screen app (auth/bad-request). Open ${here} in Safari and sign in there, or use own-shelf on this device only.`);
  await stub({});await t.page.click('#siGoogle');await until(()=>window.__authCalls.includes('redirect'));
  await signinScreen();
  ok('home screen: a redirect back without an account points to Safari',(await siErr()).startsWith('Google sign-in didn’t finish in the home-screen app. Open'));
});
