const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {chromium}=await import("playwright");
const g=await(await fetch(`${U}/auth/v1/admin/generate_link`,{method:"POST",
  headers:{apikey:K,Authorization:`Bearer ${K}`,"Content-Type":"application/json"},
  body:JSON.stringify({type:"magiclink",email:"rocketgrowthagencyadmin@gmail.com",options:{redirect_to:"https://www.rocketgrowthagency.com/portal/"}})})).json();
const b=await chromium.launch({headless:true});
const p=await (await b.newContext({viewport:{width:1180,height:1400},deviceScaleFactor:2})).newPage();
await p.goto(g.action_link||g.properties.action_link,{waitUntil:"networkidle",timeout:60000});
await p.waitForTimeout(13000);
await p.evaluate(()=>document.querySelectorAll("details:not([open])").forEach(d=>d.open=true));
await p.waitForTimeout(700);
await p.evaluate(()=>document.querySelector("[data-kickoff-change]")?.click());
await p.waitForTimeout(4500);
const el=await p.$(".kc-keep");
const card=await p.evaluateHandle(()=>document.querySelector(".kc-keep").closest(".pm-step,.pm-item,[data-kickoff-picker]")||document.querySelector("[data-kickoff-slots]"));
await card.asElement().screenshot({path:"/Users/chris/Desktop/picker-way-out.png"});
await b.close();
