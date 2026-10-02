const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await (await fetch(`${U}/rest/v1/client_onboarding_records?select=data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
const tasks=r[0].data.tasks||{};
const kind=(v)=>Array.isArray(v)?`array[${v.length}]`:v===null?"null":typeof v;
const seen=new Map();
for(const [id,t] of Object.entries(tasks)){
  const od=t.outcome_data;
  if(!od||typeof od!=="object"||!Object.keys(od).length) continue;
  const sig=Object.keys(od).sort().join(",");
  if(!seen.has(sig)) seen.set(sig,[]);
  seen.get(sig).push(id);
}
console.log(`  distinct outcome_data shapes: ${seen.size}\n`);
for(const [sig,ids] of [...seen.entries()].sort((a,b)=>b[1].length-a[1].length)){
  console.log(`  ${String(ids.length).padStart(2)}×  {${sig}}`);
  console.log(`        e.g. ${ids[0]}`);
  const od=tasks[ids[0]].outcome_data;
  for(const [k,v] of Object.entries(od).slice(0,4))
    console.log(`          ${k}: ${kind(v)} ${JSON.stringify(v).slice(0,70)}`);
}
