const { default: p } = await import("puppeteer");
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const cid=(await (await fetch(`${U}/rest/v1/clients?archived_at=is.null&select=id&limit=1`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json())[0].id;
const j=await (await fetch(`${U}/auth/v1/admin/generate_link`,{method:"POST",headers:{apikey:K,Authorization:`Bearer ${K}`,"Content-Type":"application/json"},body:JSON.stringify({type:"magiclink",email:"hello@rocketgrowthagency.com"})})).json();
const b=await p.launch({headless:"new",args:["--no-sandbox"]});
const PROPS=["fontSize","fontWeight","lineHeight","color","backgroundColor","borderLeftWidth","borderLeftColor",
  "borderTopWidth","borderRadius","paddingTop","paddingBottom","paddingLeft","paddingRight",
  "marginTop","marginBottom","display","flexDirection","gap","textTransform","letterSpacing","maxWidth"];
const read=(pg,sel)=>pg.evaluate((s,P)=>{const el=document.querySelector(s); if(!el) return null;
  const cs=getComputedStyle(el); const o={}; for (const k of P) o[k]=cs[k]; return o;},sel,PROPS);
const m=await b.newPage(); await m.setViewport({width:1150,height:1400});
await m.goto("file:///Users/chris/RGA/Rocket%20Growth%20Agency%20Website%20VS%20Code/reports/mockups/admin_how_this_step_works_v1.html",{waitUntil:"load"});
const pg=await b.newPage(); await pg.setViewport({width:1150,height:1400});
await pg.goto(j.action_link||j.properties.action_link,{waitUntil:"networkidle2",timeout:90000});
await new Promise(r=>setTimeout(r,7000));
await pg.goto(`https://www.rocketgrowthagency.com/admin/?view=client&id=${cid}&tab=onboarding-v2`,{waitUntil:"networkidle2",timeout:90000});
await new Promise(r=>setTimeout(r,16000));
await pg.evaluate(()=>document.querySelectorAll(".ob-phase:not(.open) [data-ob-phase-toggle]").forEach(x=>x.click()));
await new Promise(r=>setTimeout(r,2000));
await pg.evaluate(()=>document.querySelectorAll("details.ob-how:not([open])").forEach(d=>d.open=true));
await new Promise(r=>setTimeout(r,800));
const PAIRS=[
  ["fold body",       ".card:nth-of-type(1) .how-in:not(.flat)", ".ob-how .ob-how-in"],
  ["runs-on row",     ".runs",            ".ob-runs"],
  ["runs-on label",   ".runs .lab",       ".ob-runs .lab"],
  ["tool chip",       ".chip",            ".ob-tool"],
  ["group heading",   ".grp-h .lab",      ".ob-how-in .ob-grp-h b"],
  ["group count",     ".grp-h .c",        ".ob-how-in .ob-grp-h .c"],
  ["list item",       ".grp li",          ".ob-sop li"],
  ["note (critical)", ".note.crit",       ".ob-note.crit"],
  ["note label",      ".note.crit .lab",  ".ob-note.crit .lab"],
  ["note text",       ".note.crit p",     ".ob-note.crit p"],
  ["note (rule)",     ".note.rule",       ".ob-note.rule"],
  ["note (run)",      ".note.run",        ".ob-note.run"],
  ["note (ref)",      ".note.ref",        ".ob-note.ref"],
  ["automation",      ".auto",            ".ob-runnote"],
  ["automation label",".auto .lab",       ".ob-runnote .lab"],
  ["automation text", ".auto p",          ".ob-runnote p"],
];
let compared=0,diffs=0,missing=0;
for (const [name,ms,ls] of PAIRS) {
  const a=await read(m,ms), c=await read(pg,ls);
  if (!a) { console.log(`  ⚠️  ${name}: not in the MOCKUP (${ms})`); missing++; continue; }
  if (!c) { console.log(`  ⚠️  ${name}: not rendered on the ACTIVE step today (${ls})`); missing++; continue; }
  for (const k of PROPS) { compared++; if (String(a[k])!==String(c[k])) { console.log(`  🔴 ${name}.${k}: mockup ${a[k]} · live ${c[k]}`); diffs++; } }
}
console.log(`\n${compared} computed properties compared · ${diffs} differ · ${missing} selector(s) unmatched`);
await b.close();
