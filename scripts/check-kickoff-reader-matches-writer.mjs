import fs from "node:fs";
// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FNS=`${__SITE}/netlify/functions`;
const SAB=process.env.SABOTAGE==="1";
// 🔴 STRIP COMMENTS FIRST. The first version passed its own sabotage test, because the comment
// explaining the fix contains the words `data.kickoff_invite` — the probe matched its own
// documentation. Third time this exact trap has fired today.
const decomment = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
let email=decomment(fs.readFileSync(`${FNS}/send-confirmation-email.js`,"utf8"));
const invite=decomment(fs.readFileSync(`${FNS}/send-kickoff-invite.js`,"utf8"));
if(SAB) email=email.replace(/const kickoff = existing\?\.data\?\.kickoff_invite \|\| \{\};/,"const kickoff = {};");
console.log("── the reader must read the container the writer writes ──");
const fails=[];
// Where does the invite persist its record?
const writesTo=[...invite.matchAll(/(\w+):\s*record,/g)].map(m=>m[1]);
if(!writesTo.length){console.error("  ✗ cannot see where send-kickoff-invite persists — probe wrong");process.exit(2);}
console.log(`  writer persists under: ${writesTo.join(", ")}`);
for(const key of writesTo){
  const ok=new RegExp(`data\\?\\.${key}|data\\.${key}`).test(email);
  if(ok) console.log(`  ✅ the confirmation email reads data.${key}`);
  else {fails.push(key);console.log(`  🔴 the email never reads data.${key} — the kickoff time it announces`);
        console.log(`     comes from somewhere the writer does not write, so it silently falls back`);}
}
console.log("");
if(fails.length){console.error("🔴 a reader is looking in the wrong container — it will always hit its fallback.");process.exit(1);}
console.log("✅ reader and writer agree on where the kickoff record lives");
