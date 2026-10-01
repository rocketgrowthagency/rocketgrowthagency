import fs from "node:fs"; import vm from "node:vm";
const W="/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
const js=fs.readFileSync(W+"admin/admin.js","utf8");
const slice=(a,b)=>{const i=js.indexOf(a);const e=js.indexOf(b,i);return js.slice(i,e+b.length);};
const ctx=vm.createContext({});
vm.runInContext(`const escapeHtml=(s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const escapeAttribute=escapeHtml;
${slice("function renderStepMarkdown(","\n}")}
${slice("function outShapes(","\n}")}
globalThis._x={renderStepMarkdown,outShapes};`,ctx);
const {renderStepMarkdown,outShapes}=ctx._x;
const U=process.env.SUPABASE_URL,K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r=await (await fetch(`${U}/rest/v1/client_onboarding_records?select=data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
let bad=0, withWhy=0, n=0;
for(const [id,t] of Object.entries(r[0].data.tasks)){
  const txt=String(t.auto_result?.summary||t.outcome_data?.draft||t.outcome_data?.snippet||"").trim();
  if(!txt) continue; n++;
  const h=outShapes(renderStepMarkdown(txt));
  const m=h.match(/<p class="ob-out-why">([\s\S]*?)<\/p>/);
  if(m){ withWhy++;
    if(/<(ul|ol|p|table|h[1-6])\b/.test(m[1])){ bad++; console.log(`  🔴 ${id}: the closing remark swallowed a block — ${m[1].slice(0,70)}`); }
    // and it must be the LAST thing
    if(h.indexOf(m[0])+m[0].length < h.length-2){ bad++; console.log(`  🔴 ${id}: the "closing" remark is not last`); }
  }
}
console.log(`\n  ${n} outputs · ${withWhy} carry a closing remark · ${bad} malformed`);
process.exit(bad?1:0);
