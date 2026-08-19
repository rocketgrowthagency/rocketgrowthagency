import puppeteer from 'puppeteer';
import 'dotenv/config';
const SUP=process.env.SUPABASE_URL,KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
async function check(email,url,marker){
  const r=await fetch(`${SUP}/auth/v1/admin/generate_link`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},body:JSON.stringify({type:'magiclink',email,redirect_to:url})});
  const j=await r.json();const link=j.action_link||j.properties?.action_link;
  const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});const p=await b.newPage();
  let err=null;p.on('pageerror',e=>{if(/contract-doc|import|module/i.test(String(e)))err=String(e).slice(0,120);});
  await p.goto(link,{waitUntil:'networkidle2',timeout:60000});
  await new Promise(z=>setTimeout(z,6500));
  const ok=await p.evaluate(m=>document.body.innerText.includes(m),marker);
  console.log(`${url.split('/').pop()||'admin'}: rendered=${ok} importErr=${err||'none'}`);
  await b.close();
}
await check('hello@rocketgrowthagency.com','https://www.rocketgrowthagency.com/admin/','Pipeline');
await check('rocketgrowthagencyadmin@gmail.com','https://www.rocketgrowthagency.com/portal/','Setup');
