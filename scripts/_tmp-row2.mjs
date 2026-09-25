import fs from "node:fs";
for (const l of fs.readFileSync("/Users/chris/RGA/Rocket Growth Agency Scraper VS Code/.env","utf8").split("\n")) {
  const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,"");
}
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {chromium}=await import("playwright");
const g=await fetch(`${U}/auth/v1/admin/generate_link`,{method:"POST",headers:{apikey:K,Authorization:`Bearer ${K}`,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:"rocketgrowthagencyadmin@gmail.com",options:{redirect_to:"https://www.rocketgrowthagency.com/portal/"}})});
const link=(await g.json()).action_link;
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:1200},deviceScaleFactor:2});
await p.goto(link,{waitUntil:"networkidle",timeout:60000}); await p.waitForTimeout(3000);
await p.evaluate(()=>document.querySelector('.portal-nav a[data-view="setup"]')?.click());
await p.waitForTimeout(6000);
// open the CMS-login row
await p.evaluate(()=>{
  const r=[...document.querySelectorAll(".pm-step-row")].find(r=>/CMS login/.test(r.innerText));
  r?.querySelector("[data-step-toggle]")?.click();
});
await p.waitForTimeout(1500);
const out=await p.evaluate(()=>{
  const r=[...document.querySelectorAll(".pm-step-row")].find(r=>/CMS login/.test(r.innerText));
  const cs=(e)=>e?getComputedStyle(e):null;
  const chip=r.querySelector(".pm-plat-opt"), send=r.querySelector(".pm-commit"),
        box=r.querySelector(".pm-input"), row=r.querySelector(".pm-in-row"), fld=r.querySelector(".pm-in-field");
  return {
    chip: chip?{h:Math.round(chip.getBoundingClientRect().height),w:Math.round(chip.getBoundingClientRect().width),font:cs(chip).fontSize,weight:cs(chip).fontWeight,radius:cs(chip).borderRadius,bg:cs(chip).backgroundColor}:null,
    chipCount: r.querySelectorAll(".pm-plat-opt").length,
    sendBtn: send?{text:send.innerText.trim(),bg:cs(send).backgroundColor,font:cs(send).fontSize}:null,
    formPanel: box?{bg:cs(box).backgroundColor,border:cs(box).borderTopWidth,pad:cs(box).padding}:null,
    inputAndButtonSameRow: !!(row && row.contains(fld) && row.contains(send)),
    eyebrow: r.querySelector(".pm-in-prompt")?.innerText.trim(),
    eyebrowStyle: cs(r.querySelector(".pm-in-prompt"))?.textTransform,
    submitCount: r.querySelectorAll("[data-in-submit]").length,
    calFrame: (()=>{const k=document.querySelector(".kc");return k?{border:cs(k).borderTopWidth+" "+cs(k).borderTopColor,radius:cs(k).borderRadius,pad:cs(k).padding}:null})(),
  };
});
console.log(JSON.stringify(out,null,2));
await (await p.$(".pm-step-row:not(.is-collapsed)")).screenshot({path:process.argv[2]});
await b.close();
