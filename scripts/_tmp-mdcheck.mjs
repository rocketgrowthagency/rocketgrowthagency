import fs from "node:fs"; import vm from "node:vm";
const W="/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
const js=fs.readFileSync(W+"admin/admin.js","utf8");
const slice=(a,b)=>{const i=js.indexOf(a); const e=js.indexOf(b,i); return js.slice(i,e+b.length);};
const ctx=vm.createContext({});
vm.runInContext(`
const escapeHtml=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const escapeAttribute=escapeHtml;
${slice("function renderStepMarkdown(","\n}")}
globalThis._x={renderStepMarkdown};`,ctx);
const {renderStepMarkdown}=ctx._x;
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await (await fetch(`${U}/rest/v1/client_onboarding_records?select=data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
const tasks=r[0].data.tasks;
let pAll=0,liAll=0,bulletAsP=0;
const rows=[];
for(const [id,t] of Object.entries(tasks)){
  const txt=String(t.auto_result?.summary||t.outcome_data?.draft||t.outcome_data?.snippet||"").trim();
  if(!txt) continue;
  const h=renderStepMarkdown(txt);
  const p=(h.match(/<p>/g)||[]).length, li=(h.match(/<li>/g)||[]).length;
  pAll+=p; liAll+=li;
  // any line that LOOKS like a list item but produced a paragraph?
  for(const l of txt.split("\n").map(s=>s.trim()))
    if(/^[•·▪‣-]\s*\S/.test(l) && h.includes(`<p>${l.replace(/^[•·▪‣-]\s*/,"").slice(0,20)}`)) bulletAsP++;
  rows.push([id,txt.length,p,li]);
}
console.log(`  outputs: ${rows.length} · total <p> ${pAll} · total <li> ${liAll}`);
console.log(`  🔴 bullet-looking lines still rendered as <p>: ${bulletAsP}`);
const five=rows.find(r=>r[0]==="m1.access.password_manager");
console.log(`\n  step 5 (m1.access.password_manager): ${five[1]} chars → ${five[2]} <p>, ${five[3]} <li>`);
const h=renderStepMarkdown(String(tasks["m1.access.password_manager"].auto_result.summary).trim());
console.log("\n  --- rendered (first 700 chars) ---");
console.log("  "+h.slice(0,700).replace(/></g,">\n  <"));
