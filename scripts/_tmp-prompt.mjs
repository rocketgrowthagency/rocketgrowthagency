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
// next month → nothing selected → the PROMPT must fill the pane
await p.evaluate(()=>{ const n=[...document.querySelectorAll(".kc-nav")].find(b=>!b.disabled && b.textContent.includes("›")); n && n.click(); });
await p.waitForTimeout(900);
const out = await p.evaluate(()=>{
  const pr=document.querySelector(".pm-prompt");
  const ch=[...document.querySelectorAll(".pm-chip")].map(e=>e.innerText.trim());
  return {
    promptText: pr ? pr.innerText.replace(/\s+/g," ").trim() : null,
    promptVisible: pr ? Math.round(pr.getBoundingClientRect().height) > 0 : false,
    promptStyle: pr ? {border:getComputedStyle(pr).borderTopStyle, radius:getComputedStyle(pr).borderRadius, align:getComputedStyle(pr).textAlign} : null,
    chipsStillThere: ch,
    month: document.querySelector(".kc-month")?.textContent.trim(),
    looseSentence: !!document.querySelector(".kc-times p.is-muted"),
  };
});
console.log(JSON.stringify(out,null,2));
console.log(errs.length?`🔴 ${errs.join(" | ")}`:"✅ no page errors");
const el=await p.$(".kc"); if(el) await el.screenshot({path:process.argv[2]});
await b.close();
