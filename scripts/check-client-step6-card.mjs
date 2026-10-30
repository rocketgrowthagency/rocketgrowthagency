#!/usr/bin/env node
// check-client-step6-card.mjs — 2026-10-29. Chris approved client_step6_categories_services_v1 ("APPROVED."): client portal step 6 "Your
// categories + services". Found first: the client card said everything was on Google while admin steps 31 + 32 said RGA still had to put
// on 2 approved categories and the 13 approved services. Pinned AS BUILT, by RUNNING the lifted stepSixPending with real-shaped records:
//   · what RGA still has to add = admin 31's plan (minus dropped) not on Google + admin 32's approved services not yet put on
//   · the header pill "RGA is adding …" and the blue row only while there's something left; chips (main marked), "+N more ›" in place,
//     the links on one line (How this step works seats into it), "Change something"
//   🔒 2026-10-29 client_step06_categories_services_v1 ON THE CARD SYSTEM (Chris approved): the same promises, drawn by the system — the
//     chips are .pm-cs-chip (main marked), the blue row is csSt("rga", "RGA is adding what you approved", …), "See it on Google Maps ↗"
//     sits in the card's foot (.pm-cs-foot) where How this step works joins it (seatCsFoot), "Change something" under the card. The
//     card is RUN here with a Denver plumber's records (not RGA's).
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
import { csBlock } from "./lib/portal-cs.mjs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const P = read("portal/portal.js"), CSS = read("portal/portal.css");
const F = [], fail = (m) => F.push(m);
const i0 = P.indexOf("function stepSixPending("), i1 = P.indexOf("\n}\n", i0);
const j0 = P.indexOf("function stepSixPill("), j1 = P.indexOf("\n}\n", j0);
if (i0 < 0 || i1 < 0 || j0 < 0 || j1 < 0) { console.error("⚠️  INDETERMINATE — stepSixPending / stepSixPill moved"); process.exit(2); }
const ctx = {}; vm.createContext(ctx);
vm.runInContext(`${P.slice(i0, i1 + 2)}\n${P.slice(j0, j1 + 2)}\nthis.pend = stepSixPending; this.pill = stepSixPill;`, ctx);
const draft = '```yaml\nprimary: "Internet marketing service"\nadditional:\n  - "Marketing agency"\n  - "Marketing consultant"\n  - "Website designer"\n  - "Computer consultant"\n  - "Business management consultant"\n```';
const svcYaml = "```yaml\nservices:\n" + Array.from({ length: 13 }, (_, i) => `  - displayName: Service ${i + 1}\n    description: x\n`).join("") + "```";
const rec = (o = {}) => ({ "m1.gbp.optimize_categories": { outcome_data: { draft }, published: { after: { additional_categories: ["Marketing agency", "Website designer", "Marketing consultant"] } }, ...(o.cat || {}) },
  "m1.gbp.services_products": { approval: { decision: "approved", approved_content: svcYaml, at: "2026-09-15T18:00:00Z" }, ...(o.svc || {}) } });
const p1 = ctx.pend(rec());
if (p1.cats.join("|") !== "Computer consultant|Business management consultant" || !p1.svc || p1.svc.n !== 13 || !p1.any) fail(`step 6: what RGA still adds isn't the 2 missing categories + 13 approved services (${JSON.stringify(p1)})`);
if (!/>RGA is adding more</.test(ctx.pill(rec()))) fail(`step 6: the header pill isn't "RGA is adding more" (client_step06_simpler_v2) (${ctx.pill(rec())})`);
const p2 = ctx.pend(rec({ cat: { categories_dropped: ["Computer consultant"] }, svc: { google_push: { state: "on_google", approved_names: ["Service 1"] } } }));
if (p2.cats.join("|") !== "Business management consultant" || p2.svc) fail(`step 6: a dropped category or services RGA already put on still show as pending (${JSON.stringify(p2)})`);
const p3 = ctx.pend(rec({ cat: { published: { after: { additional_categories: ["Marketing agency", "Website designer", "Marketing consultant", "Computer consultant", "Business management consultant"] } } }, svc: { google_push: { approved_names: ["x"] } } }));
if (p3.any || ctx.pill(rec({ cat: { published: { after: { additional_categories: ["marketing agency", "website designer", "marketing consultant", "computer consultant", "business management consultant"] } } }, svc: { google_push: { approved_names: ["x"] } } }))) fail("step 6: with nothing left, the pill / row still show (or names don't match whatever their case)");
if (ctx.pend(rec(), ["Marketing agency", "Website designer", "Marketing consultant", "Computer consultant"]).cats.join("|") !== "Business management consultant") fail("step 6: the card doesn't use Google's own read of the categories when it has it");
// the card + header + links line
if (!/\$\{step\.id === "m1\.gbp\.services_products" && isDone \? stepSixPill\(onboarding\?\.data\?\.tasks\) : ""\}/.test(P)) fail("step 6: the header pill isn't drawn");
if (!/csSt\("rga", `RGA is adding \$\{pendLine\}`, "Nothing on Google gets removed\."\)/.test(P)) fail("step 6: the blue row isn't the approved short one (client_step06_simpler_v2)");
if (!/const pendChips = pend\.cats\.map\(\(n\) => ch\(escapeHtml\(n\), "rga"\)\)/.test(P) || !/Categories on Google\$\{pendChips \? " · dashed = being added" : ""\}/.test(P)) fail("step 6: the categories being added aren't shown as dashed chips with their label");
if (!/ch\(`\$\{escapeHtml\(cats\.primary\.label\)\} <em>main<\/em>`, "main"\)/.test(P) || !/data-s6-more>\+\$\{names\.length - 2\} more ›<\/button>/.test(P) || !/closest\?\.\("\[data-s6-more\]"\)/.test(P) || !/b\.parentElement\.querySelectorAll\("\[data-s6-rest\]"\)\.forEach\(\(x\) => \{ x\.hidden = false; \}\);/.test(P)) fail("step 6: the chips / main mark / +N more › are gone");
if (!/body, foot: csFoot\(\{ maps: maps \|\| "" \}\) \}\)\}\$\{pcActs\(`<button type="button" class="pm-amend" data-step-edit="\$\{escapeAttribute\(step\.id\)\}">Change something<\/button>`\)\}/.test(P)) fail("step 6: not \"Change something\" under the card, or Maps isn't in the card's foot");
// How this step works joins the foot: step 6 is a system step and the seat hands a system card's how-to to seatCsFoot
if (!/^const CS_STEPS = new Set\(\[[^\]]*"m1\.gbp\.services_products"/m.test(P) || !/if \(row && row\.classList\.contains\("pm-cs"\) && csCardOf\(row\)\) \{ seatCsFoot\(row, f\); continue; \}/.test(P)) fail("step 6: How this step works isn't seated in the card's foot (not a system step, or seatHowFolds skips seatCsFoot)");
if (/Main category", escapeHtml\(cats\.primary\.label\)[^\n]*\n[^\n]*\n[^\n]*return `<div class="pm-k5">\$\{pcCard\(\{ tone: "ok", icon: PC_TICK, head: `On Google · \$\{plural\(nCat, "category", "categories"\)\}, \$\{plural\(names\.length, "service", "services"\)\}`, side: `checked \$\{escapeHtml\(pcDate\(g\.confirmed_at \|\| g\.at\)\)\}`, body: rows \+ mapsRow/.test(P)) fail("step 6: the old table card is back");
if (!/if \(how && card && card\.classList\.contains\("pm-cs-card"\)\) \{ how\.removeAttribute\("data-seated"\); how\.classList\.remove\("pm-cs-howb"\); card\.after\(how\); \}/.test(P)) fail("step 6: the read-Google path doesn't hand How this step works back to the system seat (it would sit above the foot, or be lost)");
// photographed 10-29: an unsized spinner filled the blue row — the system's status-row icon is sized
if (!/\.pm-cs-st > svg \{ width:18px; height:18px;/.test(CSS)) fail("step 6: the blue row's icon has no size");
// ── RUN the card: a Denver plumber, 2 categories + 4 services on Google, RGA still adding 1 category + 6 approved services
{ const fnS = (n) => { const at = P.indexOf(`function ${n}(`); if (at < 0) { console.error(`⚠️  INDETERMINATE — ${n} moved`); process.exit(2); } return P.slice(at, P.indexOf("\n}\n", at) + 2); };
  const ln = (n) => { const m = P.match(new RegExp(`^const ${n} = [^\\n]*;$`, "m")); if (!m) { console.error(`⚠️  INDETERMINATE — ${n} moved`); process.exit(2); } return m[0].replace(/^const /, "var "); };
  const cx = vm.createContext({ escapeHtml: (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;"), escapeAttribute: (x) => String(x ?? "").replace(/"/g, "&quot;"), Date, Number, String, Array, Set, Object });
  vm.runInContext(`${ln("monthDay")}\n${ln("pcDate")}\n${ln("pcActs")}\n${ln("gcardMaps")}\n${csBlock(P)}\nvar pcFact = () => "";\n${fnS("stepSixPending")}\n${fnS("svcCardHtml")}\nvar _lockData = { tasks: {} };`, cx);
  const pd = '```yaml\nprimary: "Plumber"\nadditional:\n  - "Drainage service"\n  - "Water heater installation service"\n```';
  const sy = "```yaml\nservices:\n" + Array.from({ length: 6 }, (_, i) => `  - displayName: Drain job ${i + 1}\n    description: x\n`).join("") + "```";
  cx._lockData.tasks = { "m1.gbp.optimize_categories": { outcome_data: { draft: pd } }, "m1.gbp.services_products": { approval: { decision: "approved", approved_content: sy, at: "2026-10-15T18:00:00Z" } } };
  cx.__g = { labels: { a: "Drain cleaning", b: "Sewer line repair", c: "Leak repair", d: "Water heater repair" }, after: ["a", "b", "c", "d"], categories: { primary: { label: "Plumber" }, additional: [{ label: "Drainage service" }] }, confirmed_at: "2026-10-20T10:00:00Z" };
  const h = vm.runInContext(`svcCardHtml({ id: "m1.gbp.services_products" }, null, __g, "https://maps.google.com/?cid=42")`, cx);
  if (!/^<div class="pm-k5"><div class="pm-k5-plan pm-cs-card ok">/.test(h) || !/On Google · 2 categories, 4 services/.test(h)) fail(`step 6 (run): the done card isn't the green system card "On Google · 2 categories, 4 services" (${h.slice(0, 120)})`);
  if (!/<span class="pm-cs-chip main">Plumber <em>main<\/em><\/span><span class="pm-cs-chip">Drainage service<\/span>/.test(h)) fail("step 6 (run): the categories aren't system chips with the main one marked");
  if ((h.match(/data-s6-rest hidden/g) || []).length !== 2 || !/data-s6-more>\+2 more ›<\/button>/.test(h)) fail("step 6 (run): the services past the first two aren't held behind \"+2 more ›\"");
  if (!/<div class="pm-cs-st rga">[^]*<b>RGA is adding 1 category and 6 services<\/b><small>Nothing on Google gets removed\./.test(h)) fail("step 6 (run): the blue row doesn't count what RGA still adds from the records (1 category + the 6 approved services)");
  if (!/<span class="pm-cs-chip rga">Water heater installation service<\/span>/.test(h)) fail("step 6 (run): the category being added isn't a dashed chip");
  if (!/<div class="pm-cs-foot"><a class="lk" href="https:\/\/maps\.google\.com\/\?cid=42"[^>]*>See it on Google Maps ↗<\/a><\/div><\/div><div class="pm-k5-acts"><button type="button" class="pm-amend" data-step-edit="m1\.gbp\.services_products">Change something<\/button><\/div>/.test(h)) fail("step 6 (run): Maps isn't in the card's foot with ONE \"Change something\" under the card");
  cx._lockData.tasks["m1.gbp.services_products"].google_push = { approved_names: ["x"] }; cx.__g.categories.additional.push({ label: "Water heater installation service" });
  if (/pm-cs-st/.test(vm.runInContext(`svcCardHtml({ id: "m1.gbp.services_products" }, null, __g, "")`, cx))) fail("step 6 (run): the blue row stays after RGA has put everything on"); }
// step 13 (reviews_card_option_b_v1): the fields add no second inset — .pm-rv-next is the section
if (!/\.pm-r5-c\.pm-r5-one \{ display:grid; gap:8px; grid-template-columns:none; align-items:stretch; border:0; border-radius:0; padding:0; background:none; \}/.test(CSS)) fail("step 13: the customer fields draw a second inset / line inside their section");
for (const c of [".pm-cs-chips {", ".pm-cs-chip.main {", ".pm-cs-chip.more {", ".pm-cs-st.rga {"]) if (!CSS.includes(c)) fail(`step 6: the system style ${c} is gone`);
if (F.length) { console.error(`🔴 client step 6 (client_step6_categories_services_v1) drifted:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ client step 6 says what's on Google AND what RGA is still adding (the same records as admin steps 31 + 32): chips, main marked, +N more ›, the blue row + pill only while something's left, Maps in the foot, Change something under the card");
