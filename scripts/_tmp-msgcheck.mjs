import fs from "node:fs";
for (const l of fs.readFileSync("/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/.env","utf8").split("\n")) {
  const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");
}
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {chromium}=await import("playwright");
const g=await fetch(`${U}/auth/v1/admin/generate_link`,{method:"POST",headers:{apikey:K,Authorization:`Bearer ${K}`,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:"rocketgrowthagencyadmin@gmail.com",options:{redirect_to:"https://www.rocketgrowthagency.com/portal/"}})});
const link=(await g.json()).action_link;
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:1200},deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(String(e.message).slice(0,140)));
await p.goto(link,{waitUntil:"networkidle",timeout:60000}); await p.waitForTimeout(3000);
await p.evaluate(()=>document.querySelector('.portal-nav a[data-view="setup"]')?.click());
await p.waitForTimeout(7000);

await p.evaluate(()=>document.querySelectorAll("details").forEach(d=>{d.open=true;}));
await p.waitForTimeout(600);
const out = await p.evaluate(()=>{
  const vis = (e) => !!(e && e.getBoundingClientRect().height > 0);
  const txt = (s) => [...document.querySelectorAll(s)].filter(vis).map(e=>e.innerText.replace(/\s+/g," ").trim());
  return {
    chips: txt(".pm-chip"),
    pills: txt(".pm-msg"),
    prompts: txt(".pm-prompt"),
    notes: txt(".pm-note"),
    outcomes: txt(".pm-outcome"),
    looseLeft: txt(".kc-tz, .pm-in-msg, .fct-note, .fct-done"),
    suspects: [...document.querySelectorAll(".pm-msg, .pm-outcome")].map(e=>{
      const r=e.getBoundingClientRect();
      const det=e.closest("details");
      return {cls:e.className, text:e.innerText.trim().slice(0,40), h:Math.round(r.height), w:Math.round(r.width),
        hidden:e.hidden, inClosedDetails: !!(det && !det.open), display:getComputedStyle(e).display};
    }),
    chipStyle: (()=>{const c=document.querySelector(".pm-chip");if(!c)return null;const s=getComputedStyle(c);
      return {radius:s.borderRadius, bg:s.backgroundColor, font:s.fontSize, border:s.borderTopWidth};})(),
  };
});
console.log(JSON.stringify(out,null,2));
console.log(errs.length?`🔴 PAGE ERRORS: ${errs.join(" | ")}`:"✅ no page errors");
const el=await p.$(".pm-step-row:not(.is-collapsed)");
if(el) await el.screenshot({path:process.argv[2]});
await b.close();
