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
await new Promise(z=>setTimeout(z,10000));
await p.evaluate(()=>document.getElementById('adminNextActionBtn')?.click());
await new Promise(z=>setTimeout(z,3000));
if(popup){const dates=await popup.evaluate(()=>[...document.querySelectorAll('.rga-signature-meta')].map(e=>e.textContent.match(/Date:[^\n]*/)?.[0]));console.log('SIGNATURE DATES:',JSON.stringify(dates));}
await b.close();
