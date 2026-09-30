const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const {chromium}=await import("playwright");
const g=await(await fetch(`${U}/auth/v1/admin/generate_link`,{method:"POST",
  headers:{apikey:K,Authorization:`Bearer ${K}`,"Content-Type":"application/json"},
  body:JSON.stringify({type:"magiclink",email:"rocketgrowthagencyadmin@gmail.com",options:{redirect_to:"https://www.rocketgrowthagency.com/portal/"}})})).json();
const b=await chromium.launch({headless:true});
const p=await (await b.newContext({viewport:{width:1180,height:1500},deviceScaleFactor:2})).newPage();
await p.goto(g.action_link||g.properties.action_link,{waitUntil:"networkidle",timeout:60000});
await p.waitForTimeout(13000);
await p.evaluate(()=>document.querySelectorAll("details:not([open])").forEach(d=>d.open=true));
await p.waitForTimeout(700);
await p.evaluate(()=>document.querySelector("[data-kickoff-change]")?.click());
await p.waitForTimeout(4500);
// scroll the picker into view, then clip the viewport around it
const box=await p.evaluate(()=>{
  const k=document.querySelector(".kc-keep"); if(!k) return null;
  k.scrollIntoView({block:"center"});
  return null;
});
await p.waitForTimeout(600);
const clip=await p.evaluate(()=>{
  const k=document.querySelector(".kc-keep"), c=document.querySelector(".kc");
  const a=k.getBoundingClientRect(), bb=c.getBoundingClientRect();
  return {x:Math.max(0,a.x-24), y:Math.max(0,a.y-24), width:Math.min(1180-Math.max(0,a.x-24), a.width+48), height:(bb.bottom-a.top)+48};
});
await p.screenshot({path:"/Users/chris/Desktop/picker-way-out.png",clip});
await b.close();
