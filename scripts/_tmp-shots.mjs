const { default: p } = await import("puppeteer");
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const cid=(await (await fetch(`${U}/rest/v1/clients?archived_at=is.null&select=id&limit=1`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json())[0].id;
const j=await (await fetch(`${U}/auth/v1/admin/generate_link`,{method:"POST",headers:{apikey:K,Authorization:`Bearer ${K}`,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:"hello@rocketgrowthagency.com"})})).json();
const b=await p.launch({headless:"new",args:["--no-sandbox"]});
const pg=await b.newPage(); await pg.setViewport({width:1150,height:1500,deviceScaleFactor:2});
await pg.goto(j.action_link||j.properties.action_link,{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,6000));
await pg.goto(`https://www.rocketgrowthagency.com/admin/?view=client&id=${cid}&tab=onboarding-v2`,{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,15000));
await pg.evaluate(()=>document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach(x=>x.click()));
await new Promise(r=>setTimeout(r,2000));
await pg.evaluate(()=>document.querySelectorAll("details.ob-out:not([open])").forEach(d=>d.open=true));
await new Promise(r=>setTimeout(r,900));
const nums = await pg.evaluate(()=>[...document.querySelectorAll('.ob-struct[data-struct="text"]')]
  .map(s=>s.closest(".ob-step")?.querySelector(".ob-sid")?.textContent?.trim()||"?"));
console.log("cards now rendering the designed text view:", nums.join(", "));
for (const n of ["22","21","20"]) {
  const h=await pg.evaluateHandle((num)=>[...document.querySelectorAll(".ob-step")]
    .find(c=>c.querySelector(".ob-sid")?.textContent?.trim()===num), n);
  const el=h.asElement();
  if (el) { try { await el.screenshot({path:`/Users/chris/Desktop/step-${n}-designed.png`}); } catch(e){ console.log(`step ${n}: ${e.message.split(String.fromCharCode(10))[0].slice(0,70)}`); } }
  else console.log(`step ${n}: card not on the page`);
}
await b.close();
