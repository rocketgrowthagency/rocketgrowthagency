import fs from "node:fs";
const W="/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
const m1=JSON.parse(fs.readFileSync(W+"data/playbooks/playbooks.json","utf8")).month1;
const byId=new Map(m1.map((s,i)=>[s.id,{...s,n:i+1}]));
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await (await fetch(`${U}/rest/v1/client_onboarding_records?select=data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
const tasks=r[0].data.tasks||{};

// A SETTING is something a HUMAN chose or authored that the product acts on later.
// An audit RESULT is something a scan observed. You do not "change" what a scan found.
const AUTHORED = ["draft","snippet","google_review_link","gbp_url","body","subject"];
const CHOICE   = ["client_choice","selected","choice"];
const setting=[], result=[], none=[];
for(const s of m1){
  const t=tasks[s.id]||{};
  const od=(t.outcome_data&&typeof t.outcome_data==="object")?t.outcome_data:{};
  const keys=Object.keys(od);
  const chosen=CHOICE.filter(k=>t[k]!==undefined&&t[k]!==null);
  const authored=AUTHORED.filter(k=>od[k]!==undefined&&od[k]!==null&&String(od[k]).trim()!=="");
  if(chosen.length||authored.length) setting.push([s,[...chosen,...authored].join(",")]);
  else if(keys.length) result.push([s,keys.slice(0,3).join(",")]);
  else none.push(s);
}
console.log(`  a HUMAN decided it (a setting) : ${setting.length}`);
setting.forEach(([s,k])=>console.log(`     ${String(byId.get(s.id).n).padStart(2)}  ${s.id.padEnd(26)} ${k}`));
console.log(`\n  a SCAN observed it (a result)  : ${result.length}  — no Change control; you cannot edit a finding`);
console.log(`  nothing stored yet             : ${none.length}`);
console.log(`\n  steps that WILL hold a choice once used (by design):`);
for(const s of m1) if(/decline|choose|pick|lock|select/i.test(s.t||"")||s.choices||s.clientChoices)
  console.log(`     ${String(byId.get(s.id).n).padStart(2)}  ${s.id.padEnd(26)} ${(s.t||"").slice(0,42)}`);
