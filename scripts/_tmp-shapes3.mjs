const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await (await fetch(`${U}/rest/v1/client_onboarding_records?select=data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
const tasks=r[0].data.tasks||{};
const fenced=[];
for(const [id,t] of Object.entries(tasks)){
  const txt=String(t.auto_result?.summary||t.outcome_data?.draft||t.outcome_data?.snippet||"").trim();
  if(!txt) continue;
  for(const m of txt.matchAll(/```([a-z]*)\n([\s\S]*?)```/g)) fenced.push([id,m[1]||"(none)",m[2]]);
}
console.log(`  fenced blocks across all outputs: ${fenced.length}\n`);
for(const [id,lang,body] of fenced){
  const lines=body.split("\n").filter(l=>l.trim());
  // top-level keys and list items
  const topKeys=[...new Set(lines.filter(l=>/^[A-Za-z_][\w ]*:/.test(l)).map(l=>l.split(":")[0]))];
  const items=lines.filter(l=>/^\s*-\s/.test(l)).length;
  const nested=[...new Set(lines.filter(l=>/^\s{2,}[A-Za-z_][\w ]*:/.test(l)).map(l=>l.trim().split(":")[0]))];
  console.log(`  ${id}  [${lang}]  ${body.length} chars`);
  console.log(`     top-level keys : ${topKeys.join(", ")||"(none)"}`);
  console.log(`     list items     : ${items}`);
  console.log(`     item fields    : ${nested.slice(0,6).join(", ")||"(none)"}`);
  console.log(`     first 3 lines  : ${lines.slice(0,3).map(l=>l.trim()).join(" | ").slice(0,96)}\n`);
}
