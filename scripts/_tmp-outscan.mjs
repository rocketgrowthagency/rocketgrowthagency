const U=process.env.SUPABASE_URL, K=process.env.SUPABASE_SERVICE_ROLE_KEY;
const r = await (await fetch(`${U}/rest/v1/client_onboarding_records?select=client_id,data`,{headers:{apikey:K,Authorization:`Bearer ${K}`}})).json();
let outs=[];
for (const rec of r) for (const [id,t] of Object.entries(rec.data?.tasks||{})) if (t.output) outs.push({id,out:String(t.output)});
console.log(`  stored outputs: ${outs.length}`);
const stat={bulletChar:0,dashBullet:0,numbered:0,colonHeading:0,allCapsLabel:0,hasUrl:0,hasEmail:0,blockquote:0,mdHeading:0};
const examples={};
for(const o of outs){
  const L=o.out.split("\n").map(s=>s.trim());
  const add=(k,line)=>{ stat[k]++; if(!examples[k]) examples[k]=`${o.id}: ${line.slice(0,62)}`; };
  let f={};
  for(const l of L){
    if(/^[•·▪]\s*/.test(l) && !f.bulletChar){f.bulletChar=1;add("bulletChar",l);}
    if(/^[-*+]\s+/.test(l) && !f.dashBullet){f.dashBullet=1;add("dashBullet",l);}
    if(/^\d+[.)]\s+/.test(l) && !f.numbered){f.numbered=1;add("numbered",l);}
    if(/^#{1,4}\s+/.test(l) && !f.mdHeading){f.mdHeading=1;add("mdHeading",l);}
    if(/^&gt;|^>/.test(l) && !f.blockquote){f.blockquote=1;add("blockquote",l);}
    if(/^[A-Z][A-Za-z0-9 /&()'’-]{2,60}:$/.test(l) && !f.colonHeading){f.colonHeading=1;add("colonHeading",l);}
    if(/^[A-Z][A-Z0-9 /&()'’-]{2,60}(\s*\(.*\))?:/.test(l) && !f.allCapsLabel){f.allCapsLabel=1;add("allCapsLabel",l);}
  }
  if(/https?:\/\//.test(o.out)) stat.hasUrl++;
  if(/[\w.]+@[\w.]+\.\w+/.test(o.out)) stat.hasEmail++;
}
console.log("");
for(const [k,v] of Object.entries(stat)) console.log(`  ${String(v).padStart(3)} output(s)  ${k.padEnd(14)} ${examples[k]?"e.g. "+examples[k]:""}`);
console.log(`\n  lengths: ${outs.map(o=>o.out.length).sort((a,b)=>a-b).join(", ").slice(0,160)}`);
