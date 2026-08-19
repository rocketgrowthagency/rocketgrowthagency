import puppeteer from 'puppeteer';
import 'dotenv/config';
const SUP=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SP="/private/tmp/claude-501/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/c82fa8f6-965d-4613-89b3-b14fb8343738/scratchpad";
const r=await fetch(`${SUP}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'hello@rocketgrowthagency.com',redirect_to:'https://www.rocketgrowthagency.com/admin/'})});
const j=await r.json();const link=j.action_link||j.properties?.action_link;
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox','--window-size=1500,1700']});const p=await b.newPage();
await p.setViewport({width:1500,height:1700,deviceScaleFactor:1});
await p.goto(link,{waitUntil:'networkidle2',timeout:60000});
await new Promise(z=>setTimeout(z,7000));
async function clickNav(label){await p.evaluate(l=>{const a=[...document.querySelectorAll('.admin-nav a, nav a, aside a, aside button')].find(x=>x.textContent.trim().toLowerCase()===l.toLowerCase());if(a)a.click();else{const b=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.trim().toLowerCase()===l.toLowerCase());b&&b.click();}},label);await new Promise(z=>setTimeout(z,2200));}
for(const v of ['Approvals','Portal Accounts','Prospects']){await clickNav(v);await p.screenshot({path:`${SP}/vpa_${v.replace(/\s/g,'')}.png`});}
// Client Command Center: go to pipeline, click RGA card
await clickNav('Pipeline');
await p.evaluate(()=>{const c=[...document.querySelectorAll('.admin-pcard')].find(x=>/Rocket Growth Agency/.test(x.textContent));c&&c.click();});
await new Promise(z=>setTimeout(z,3000));
await p.screenshot({path:`${SP}/vpa_CommandCenter.png`});
console.log('done');
await b.close();
