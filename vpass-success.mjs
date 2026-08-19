import puppeteer from 'puppeteer';
import 'dotenv/config';
const SUP=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
const SP="/private/tmp/claude-501/-Users-chris-RGA-Rocket-Growth-Agency-Website-VS-Code/c82fa8f6-965d-4613-89b3-b14fb8343738/scratchpad";
const r=await fetch(`${SUP}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email:'rocketgrowthagencyadmin@gmail.com',redirect_to:'https://www.rocketgrowthagency.com/portal/'})});
const j=await r.json();const link=j.action_link||j.properties?.action_link;
const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});const p=await b.newPage();
await p.setViewport({width:1200,height:800,deviceScaleFactor:1});
await p.goto(link,{waitUntil:'networkidle2',timeout:60000});
await new Promise(z=>setTimeout(z,6500));
// Inject the branded success panel using the LIVE deployed CSS (no data mutation)
await p.evaluate(()=>{
  const ov=document.createElement('div');ov.id='rga-contract-modal';
  const m=document.createElement('div');m.className='pm-contract';
  m.innerHTML=`<div class="pm-c-success"><div class="badge">✓</div><h2>You're all set, Chris!</h2><p>Your service agreement is signed and your Rocket Growth Agency account is now active. We'll walk you through the remaining setup steps from here.</p><p class="meta">Signed July 23, 2026 · a copy has been emailed to you.</p><button class="pm-c-btn brand">Continue to your portal →</button></div>`;
  ov.appendChild(m);document.body.appendChild(ov);
});
await new Promise(z=>setTimeout(z,400));
await p.screenshot({path:SP+'/vp_success.png'});
await b.close();console.log('done');
