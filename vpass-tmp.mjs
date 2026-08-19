import puppeteer from 'puppeteer';
import 'dotenv/config';
const SUP = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.VP_EMAIL || 'hello@rocketgrowthagency.com';
const TAB = process.env.VP_TAB || '';
const OUT = process.env.VP_OUT || 'vpass_out.png';
const REDIR = process.env.VP_REDIR || 'https://www.rocketgrowthagency.com/portal/';
const r = await fetch(`${SUP}/auth/v1/admin/generate_link`, {
  method:'POST', headers:{apikey:KEY, Authorization:`Bearer ${KEY}`, 'Content-Type':'application/json'},
  body: JSON.stringify({ type:'magiclink', email: EMAIL, redirect_to: REDIR })
});
const j = await r.json();
const link = j.action_link || j.properties?.action_link;
if(!link){ console.error('NO LINK', JSON.stringify(j).slice(0,300)); process.exit(1); }
const b = await puppeteer.launch({headless:'new', args:['--no-sandbox','--window-size=1400,2200']});
const p = await b.newPage();
await p.setViewport({width:1400, height:2200, deviceScaleFactor:1});
await p.goto(link, {waitUntil:'networkidle2', timeout:60000});
await new Promise(z=>setTimeout(z,6500));
if(TAB){ await p.evaluate(t=>{ const a=[...document.querySelectorAll('.portal-nav a')].find(x=>x.textContent.toLowerCase().includes(t)); if(a) a.click(); else location.hash=t; }, TAB); await new Promise(z=>setTimeout(z,2000)); }
const state = await p.evaluate(()=>({
  hasDash: !!document.querySelector('.portal-client-section, .portal-main'),
  loadingVisible: !!document.querySelector('.portal-loading:not([hidden])'),
  heading: document.querySelector('h1,.portal-welcome,.portal-brand-copy h1')?.textContent?.trim()?.slice(0,60),
  cards: document.querySelectorAll('.portal-card, .portal-client-section').length
}));
console.log(JSON.stringify(state));
await p.screenshot({path: OUT, fullPage:true});
await b.close();
