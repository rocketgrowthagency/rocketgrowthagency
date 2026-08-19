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
await new Promise(z=>setTimeout(z,10000)); // full reload + client load
const btn=await p.evaluate(()=>{const el=document.getElementById('adminNextActionBtn');return{text:el?.textContent?.trim(),contractId:el?.getAttribute('data-open-contract')||'none',extra:document.getElementById('adminNextActionExtra')?.textContent?.trim()?.slice(0,50)};});
console.log('BUTTON:',JSON.stringify(btn));
await p.evaluate(()=>document.getElementById('adminNextActionBtn')?.click());
await new Promise(z=>setTimeout(z,2500));
console.log('POPUP:',popup?JSON.stringify((await popup.evaluate(()=>document.body.innerText.slice(0,50)))):'none');
await b.close();
