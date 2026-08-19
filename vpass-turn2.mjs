import puppeteer from 'puppeteer';
import 'dotenv/config';
const SUP=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SP="/private/tmp/claude-501/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/c82fa8f6-965d-4613-89b3-b14fb8343738/scratchpad";
const r=await fetch(`${SUP}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'hello@rocketgrowthagency.com',redirect_to:'https://www.rocketgrowthagency.com/admin/'})});
const j=await r.json();const link=j.action_link||j.properties?.action_link;
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1500,1100']});const p=await b.newPage();
await p.setViewport({width:1500,height:1100,deviceScaleFactor:2});
await p.goto(link,{waitUntil:'networkidle2',timeout:60000});
await new Promise(z=>setTimeout(z,7000));
await p.evaluate(()=>{const c=[...document.querySelectorAll('.admin-pcard')].find(x=>/Rocket Growth Agency/.test(x.textContent));c&&c.click();});
await new Promise(z=>setTimeout(z,6000));
const st=await p.evaluate(()=>({you:document.getElementById('adminActionOwner')?.textContent,youTitle:document.getElementById('adminNextActionTitle')?.textContent,client:document.getElementById('clientActionOwner')?.textContent,clientTitle:document.getElementById('clientNextActionTitle')?.textContent,youWaiting:document.getElementById('adminActionCol')?.className.includes('is-waiting'),clientWaiting:document.getElementById('clientActionCol')?.className.includes('is-waiting')}));
console.log(JSON.stringify(st,null,1));
const el=await p.$('#adminNextActionCard');if(el){await p.evaluate(()=>document.getElementById('adminNextActionCard')?.scrollIntoView({block:'center'}));await new Promise(z=>setTimeout(z,400));await el.screenshot({path:SP+'/vp_turn.png'});}
await b.close();
