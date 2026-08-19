import puppeteer from 'puppeteer';
import 'dotenv/config';
const SUP=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SP="/private/tmp/claude-501/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/c82fa8f6-965d-4613-89b3-b14fb8343738/scratchpad";
const RGA="ae817a9c-60a2-4cc9-a196-0582b7b7e7c3";
const r=await fetch(`${SUP}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'hello@rocketgrowthagency.com',redirect_to:'https://www.rocketgrowthagency.com/admin/'})});
const j=await r.json();const link=j.action_link||j.properties?.action_link;
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});const p=await b.newPage();
await p.setViewport({width:1500,height:1000,deviceScaleFactor:2});
await p.goto(link,{waitUntil:'networkidle2',timeout:60000});
await new Promise(z=>setTimeout(z,7000));
await p.evaluate(()=>document.querySelector('#pendingActionsBanner [data-pending-go]')?.click());
await new Promise(z=>setTimeout(z,10000));
const st=await p.evaluate(()=>({you:document.getElementById('adminActionOwner')?.textContent,youTitle:document.getElementById('adminNextActionTitle')?.textContent,client:document.getElementById('clientActionOwner')?.textContent,clientTitle:document.getElementById('clientNextActionTitle')?.textContent,youDim:document.getElementById('adminActionCol')?.className,clientDim:document.getElementById('clientActionCol')?.className}));
console.log(JSON.stringify(st,null,1));

await b.close();
