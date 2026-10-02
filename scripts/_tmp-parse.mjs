import fs from "node:fs"; import vm from "node:vm";
const W="/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
const js=fs.readFileSync(W+"admin/admin.js","utf8");
const i=js.indexOf("const yIndent ="), e=js.indexOf("function renderStepMarkdown(");
const ctx=vm.createContext({});
vm.runInContext(`const escapeHtml=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");`+js.slice(i,e)+"globalThis._x={parseYamlish,structuredCoversSource,structuredHtml};",ctx);
const {parseYamlish,structuredCoversSource,structuredHtml}=ctx._x;
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await (await fetch(`${U}/rest/v1/client_onboarding_records?select=data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
const tasks=r[0].data.tasks||{};
let n=0, parsed=0, covered=0;
for(const [id,t] of Object.entries(tasks)){
  const txt=String(t.auto_result?.summary||t.outcome_data?.draft||t.outcome_data?.snippet||"").trim();
  if(!txt) continue;
  for(const m of txt.matchAll(/```([a-z]*)\n([\s\S]*?)```/g)){
    n++;
    const p=parseYamlish(m[2]);
    const ok=p?structuredCoversSource(p,m[2]):null;
    if(p) parsed++; if(ok) covered++;
    console.log(`  ${id.padEnd(30)} [${(m[1]||"-").padEnd(4)}] ${p?("parsed "+p.map(b=>`${b.key}:${b.kind}${b.items?"("+b.items.length+")":""}`).join(" ")):"→ falls back to source"}${p&&!ok?"  🔴 DROPS DATA":""}`);
  }
}
console.log(`\n  ${n} fenced blocks · ${parsed} parsed · ${covered} of ${parsed} keep every value`);
// and the round trip on the big one
const t26=String(tasks["m1.strategy.keywords_locations"].auto_result.summary);
const b26=t26.match(/```[a-z]*\n([\s\S]*?)```/)[1];
const p26=parseYamlish(b26);
console.log("\n  step 26 rendered:");
const h=structuredHtml(p26);
console.log("    groups:",(h.match(/ob-grp-h/g)||[]).length," items:",(h.match(/ob-item/g)||[]).length," reasons:",(h.match(/class="w"/g)||[]).length);
console.log("    titles:",p26.flatMap(b=>b.items?b.items.map(x=>x.title||x):[]).slice(0,3).join(" | "));
