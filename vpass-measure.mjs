import puppeteer from 'puppeteer';
import 'dotenv/config';
const SUP=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
async function link(email,url){const r=await fetch(`${SUP}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email,redirect_to:url})});const j=await r.json();return j.action_link||j.properties?.action_link;}
function m(el){if(!el)return null;const c=getComputedStyle(el);return `${parseFloat(c.fontSize).toFixed(1)}px/${c.fontWeight}/${c.color}`;}
// CLIENT portal
const p1=await b.newPage();await p1.goto(await link('rocketgrowthagencyadmin@gmail.com','https://www.rocketgrowthagency.com/portal/'),{waitUntil:'networkidle2',timeout:60000});await new Promise(z=>setTimeout(z,6500));
const client=await p1.evaluate(()=>{const g=s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return `${parseFloat(c.fontSize).toFixed(1)}px/${c.fontWeight}`;};return{h1:g('#portalWelcomeHeading'),sub:g('#portalWelcomeCopy'),kpiLabel:g('.pm-kpi .lbl'),kpiVal:g('.pm-kpi .val'),cardTitle:g('.pm-card-h h3'),rowLabel:g('.pm-row .rk')};});
console.log('CLIENT:',JSON.stringify(client));
// ADMIN command center
const p2=await b.newPage();await p2.goto(await link('hello@rocketgrowthagency.com','https://www.rocketgrowthagency.com/admin/'),{waitUntil:'networkidle2',timeout:60000});await new Promise(z=>setTimeout(z,7000));
await p2.evaluate(()=>document.querySelector('#pendingActionsBanner [data-pending-go]')?.click());
await new Promise(z=>setTimeout(z,9000));
const admin=await p2.evaluate(()=>{const g=s=>{const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return `${parseFloat(c.fontSize).toFixed(1)}px/${c.fontWeight}`;};return{clientTitle:g('#clientTitle'),subtitle:g('#clientSubtitle'),statLabel:g('.admin-stat span'),statVal:g('.admin-stat strong'),nextTitle:g('#adminNextActionTitle'),nextDesc:g('#adminNextActionDesc')};});
console.log('ADMIN:',JSON.stringify(admin));
await b.close();
