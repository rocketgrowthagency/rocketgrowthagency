import fs from "node:fs";
const W="/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
const m1=JSON.parse(fs.readFileSync(W+"data/playbooks/playbooks.json","utf8")).month1;
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await (await fetch(`${U}/rest/v1/client_onboarding_records?select=data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
const tasks=r[0].data.tasks||{};
let hidden=[];
for(const s of m1){
  const t=tasks[s.id]||{};
  const txt=String(t.auto_result?.summary||t.outcome_data?.draft||t.outcome_data?.snippet||"").trim();
  if(!txt) continue;
  const st=t.status||"";
  if(st==="done"||st==="declined"||st==="skipped") continue;      // the done branch shows it
  hidden.push([s.id, st||"(none)", txt.length, /```/.test(txt)?"fenced":""]);
}
console.log(`  ${hidden.length} step(s) hold output and are not done:`);
hidden.forEach(([id,st,n,f])=>console.log(`    ${id.padEnd(30)} ${st.padEnd(12)} ${String(n).padStart(6)} chars ${f}`));
console.log(`\n  of these, only the ACTIVE one renders it today.`);
