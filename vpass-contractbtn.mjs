import puppeteer from 'puppeteer';
import 'dotenv/config';
const SUP=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await fetch(`${SUP}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'hello@rocketgrowthagency.com',redirect_to:'https://www.rocketgrowthagency.com/admin/'})});
const j=await r.json();const link=j.action_link||j.properties?.action_link;
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});const p=await b.newPage();
let popup=null;p.on('popup',t=>popup=t);
await p.goto(link,{waitUntil:'networkidle2',timeout:60000});
await new Promise(z=>setTimeout(z,7000));
await p.evaluate(()=>document.querySelector('#pendingActionsBanner [data-pending-go]')?.click());
await new Promise(z=>setTimeout(z,4000));
const btn=await p.evaluate(()=>{const el=document.getElementById('adminNextActionBtn');return{text:el?.textContent?.trim(),hasContract:el?.getAttribute('data-open-contract')?'yes':'no',favicon:document.querySelector('link[rel=icon][type="image/svg+xml"]')?.href};});
console.log('BUTTON:',JSON.stringify(btn));
// click it -> should open contract in a popup tab
await p.evaluate(()=>document.getElementById('adminNextActionBtn')?.click());
await new Promise(z=>setTimeout(z,2500));
if(popup){const t=await popup.evaluate(()=>document.body.innerText.slice(0,60));console.log('POPUP OPENED:',JSON.stringify(t));}else console.log('POPUP OPENED: none');
await b.close();
