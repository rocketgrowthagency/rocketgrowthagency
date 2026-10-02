import fs from "node:fs"; import vm from "node:vm";
const W="/Users/chris/RGA/Rocket Growth Agency Website VS Code/";
const src=fs.readFileSync(W+"admin/admin.js","utf8");
const pb=JSON.parse(fs.readFileSync(W+"data/playbooks/playbooks.json","utf8"));
const pick=(n)=>{const i=src.indexOf(`function ${n}(`); if(i<0) throw new Error("MISSING "+n);
  let d=0; for(let k=src.indexOf("{",i);k<src.length;k++){if(src[k]==="{")d++;else if(src[k]==="}"){d--;if(!d)return src.slice(i,k+1);}} throw new Error("unbalanced "+n);};
const block=(re)=>{const m=src.match(re); const i=m.index; let d=0,st=false;
  for(let k=i;k<src.length;k++){const c=src[k]; if(c==="["||c==="("){d++;st=true;} else if(c==="]"||c===")"){d--; if(st&&!d) return src.slice(i, src.indexOf(";",k)+1);} }};
const ctx=vm.createContext({console});
vm.runInContext(block(/const OB_PHASES = \[/)+"\n"+src.split("\n").filter(l=>/^const obGroupOf =/.test(l)).join("\n")+"\n"
  +["obBuckets","obRespectDeps","obPageOrdered","obPageNumbers"].map(pick).join("\n\n"), ctx);

const m1=pb.month1;
const steps=m1.map(s=>({obj:{flowId:s.id, sopType:s.type}, dependsOn:s.dependsOn||[]}));
const ordered=vm.runInContext("obPageOrdered",ctx)(steps);
const nums=vm.runInContext("obPageNumbers",ctx)(steps);

console.log(`steps: ${m1.length} · ordered: ${ordered.length} · distinct: ${new Set(ordered).size}`);
const n=[...nums.values()].sort((a,b)=>a-b);
console.log(`numbering 1..${m1.length}: ${n.every((v,i)=>v===i+1) ? "✅ contiguous, no gaps or dupes" : "🔴 BROKEN"}`);
const posOf=new Map(); ordered.forEach((i,k)=>posOf.set(steps[i].obj.flowId,k));
const bad=[];
for (const s of m1) for (const d of (s.dependsOn||[])) {
  if (!posOf.has(d)) continue;
  if (posOf.get(d) > posOf.get(s.id)) bad.push(`${s.id} (#${nums.get(m1.findIndex(x=>x.id===s.id))}) needs ${d} (#${nums.get(m1.findIndex(x=>x.id===d))})`);
}
console.log(`\n🔴 dependencies rendering BACKWARDS: ${bad.length}`);
for (const b of bad) console.log("   "+b);
console.log("\nthe research → baseline run, as it now renders:");
for (const id of ["m1.audit.competitors","m1.strategy.keywords_locations","m1.audit.grid_baseline","m1.audit.kpi_baseline","m1.audit.citations"]) {
  const i=m1.findIndex(x=>x.id===id);
  console.log(`   #${String(nums.get(i)).padStart(2)}  ${id}`);
}
