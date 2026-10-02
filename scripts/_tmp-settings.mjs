import fs from "node:fs";
const W="/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
const m1=JSON.parse(fs.readFileSync(W+"data/playbooks/playbooks.json","utf8")).month1;
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await (await fetch(`${U}/rest/v1/client_onboarding_records?select=data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
const tasks=r[0].data.tasks||{};
const admin=fs.readFileSync(W+"admin/admin.js","utf8");
const portal=fs.readFileSync(W+"portal/portal.js","utf8");

// A step holds a SETTING if its record carries a value a human chose or supplied.
const SETTING_KEYS=["client_choice","outcome_data","client_input","selected","value","answers"];
let holds=[], none=[];
for(const [i,s] of m1.entries()){
  const t=tasks[s.id]||{};
  const keys=SETTING_KEYS.filter(k=>t[k]!==undefined && t[k]!==null && !(typeof t[k]==="object" && !Object.keys(t[k]).length));
  (keys.length?holds:none).push([i+1,s.id,keys.join(",")]);
}
console.log(`  steps whose record currently holds a setting: ${holds.length} of ${m1.length}`);
holds.forEach(([n,id,k])=>console.log(`    ${String(n).padStart(2)}  ${id.padEnd(26)} ${k}`));

// which steps DECLARE they capture something (so they will hold one once used)
const declares=m1.filter(s=>s.clientInput||s.inputSpec||s.choices||s.clientChoices||/decline|choose|pick|lock|select/i.test(s.t||""));
console.log(`\n  steps that CAPTURE a choice or an input by design: ${declares.length}`);
declares.slice(0,14).forEach(s=>console.log(`    ${s.id.padEnd(26)} ${(s.t||"").slice(0,44)}`));

console.log(`\n  ── the CHANGE affordance today ──`);
console.log(`    client portal "Change" control : ${(portal.match(/data-step-change|>Change</g)||[]).length} site(s)`);
console.log(`    admin "Undo" on a done step    : ${(admin.match(/data-onboard-undo|↩ Undo/g)||[]).length} site(s)`);
console.log(`    admin "Change" (a setting)     : ${(admin.match(/data-step-change|>Change</g)||[]).length} site(s)`);
