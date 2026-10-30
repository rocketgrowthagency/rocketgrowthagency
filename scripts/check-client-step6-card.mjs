#!/usr/bin/env node
// check-client-step6-card.mjs — 2026-10-29. Chris approved client_step6_categories_services_v1 ("APPROVED."): client portal step 6 "Your
// categories + services". Found first: the client card said everything was on Google while admin steps 31 + 32 said RGA still had to put
// on 2 approved categories and the 13 approved services. Pinned AS BUILT, by RUNNING the lifted stepSixPending with real-shaped records:
//   · what RGA still has to add = admin 31's plan (minus dropped) not on Google + admin 32's approved services not yet put on
//   · the header pill "RGA is adding …" and the blue row only while there's something left; chips (main marked), "+N more ›" in place,
//     the links on one line (How this step works seats into it), "Change something"
// Point it at a copy with APPROVAL_ARCHIVE_SITE_DIR. exit 0 holds · 1 regressed · 2 code moved
import fs from "node:fs";
import vm from "node:vm";
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
if (!/RGA is adding 2 categories \+ your services/.test(ctx.pill(rec()))) fail(`step 6: the header pill doesn't say what RGA is adding (${ctx.pill(rec())})`);
const p2 = ctx.pend(rec({ cat: { categories_dropped: ["Computer consultant"] }, svc: { google_push: { state: "on_google", approved_names: ["Service 1"] } } }));
if (p2.cats.join("|") !== "Business management consultant" || p2.svc) fail(`step 6: a dropped category or services RGA already put on still show as pending (${JSON.stringify(p2)})`);
const p3 = ctx.pend(rec({ cat: { published: { after: { additional_categories: ["Marketing agency", "Website designer", "Marketing consultant", "Computer consultant", "Business management consultant"] } } }, svc: { google_push: { approved_names: ["x"] } } }));
if (p3.any || ctx.pill(rec({ cat: { published: { after: { additional_categories: ["marketing agency", "website designer", "marketing consultant", "computer consultant", "business management consultant"] } } }, svc: { google_push: { approved_names: ["x"] } } }))) fail("step 6: with nothing left, the pill / row still show (or names don't match whatever their case)");
if (ctx.pend(rec(), ["Marketing agency", "Website designer", "Marketing consultant", "Computer consultant"]).cats.join("|") !== "Business management consultant") fail("step 6: the card doesn't use Google's own read of the categories when it has it");
// the card + header + links line
if (!/\$\{step\.id === "m1\.gbp\.services_products" && isDone \? stepSixPill\(onboarding\?\.data\?\.tasks\) : ""\}/.test(P)) fail("step 6: the header pill isn't drawn");
if (!/<b>RGA is adding what you approved<\/b>/.test(P) || !/Nothing you already have on Google is removed; each is checked on Google after it goes on\./.test(P)) fail("step 6: the blue row isn't the mockup's");
if (!/ch\(`\$\{escapeHtml\(cats\.primary\.label\)\} <em>main<\/em>`, "main"\)/.test(P) || !/data-s6-more>\+\$\{names\.length - 2\} more ›<\/button>/.test(P) || !/closest\?\.\("\[data-s6-more\]"\)/.test(P) || !/b\.parentElement\.querySelectorAll\("\[data-s6-rest\]"\)\.forEach\(\(x\) => \{ x\.hidden = false; \}\);/.test(P)) fail("step 6: the chips / main mark / +N more › are gone");
if (!/attrs: " data-how-inline" \}\)\}\$\{pcActs\(`<button type="button" class="pm-amend" data-step-edit="\$\{escapeAttribute\(step\.id\)\}">Change something<\/button>`\)\}/.test(P)) fail("step 6: not \"Change something\", or the links aren't one line");
if (!/card\.hasAttribute\("data-how-inline"\) && card\.querySelector\(":scope > \.pm-pc-lnks"\)\) \{/.test(P) || !/\.pm-pc-lnks > details\.pm-how-inline \{ margin-left:auto;/.test(CSS)) fail("step 6: How this step works isn't seated in the links line");
if (/Main category", escapeHtml\(cats\.primary\.label\)[^\n]*\n[^\n]*\n[^\n]*return `<div class="pm-k5">\$\{pcCard\(\{ tone: "ok", icon: PC_TICK, head: `On Google · \$\{plural\(nCat, "category", "categories"\)\}, \$\{plural\(names\.length, "service", "services"\)\}`, side: `checked \$\{escapeHtml\(pcDate\(g\.confirmed_at \|\| g\.at\)\)\}`, body: rows \+ mapsRow/.test(P)) fail("step 6: the old table card is back");
if (!/if \(card\.hasAttribute\("data-how-inline"\) && ln\) \{ ln\.appendChild\(how\); how\.classList\.add\("pm-how-inline"\); \}/.test(P)) fail("step 6: the read-Google path puts How this step works above the links instead of in their line");
// photographed 10-29: an unsized spinner filled the blue row; a fold's own top line showed inside the links line
if (!/\.pm-s6-rga > svg \{ flex:0 0 auto; width:18px; height:18px;/.test(CSS) || !/\.pm-pc-lnks > details\.pm-how-inline \{ margin-left:auto; border-top:0; \}/.test(CSS)) fail("step 6: the blue row's spinner has no size, or How this step works draws a line in the links row");
// step 13 (reviews_card_option_b_v1): the fields add no second inset — .pm-rv-next is the section
if (!/\.pm-r5-c\.pm-r5-one \{ display:grid; gap:8px; grid-template-columns:none; align-items:stretch; border:0; border-radius:0; padding:0; background:none; \}/.test(CSS)) fail("step 13: the customer fields draw a second inset / line inside their section");
for (const c of [".pm-s6-sec {", ".pm-s6-ch.main {", ".pm-s6-rga {"]) if (!CSS.includes(c)) fail(`step 6: the style ${c} is gone`);
if (F.length) { console.error(`🔴 client step 6 (client_step6_categories_services_v1) drifted:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ client step 6 says what's on Google AND what RGA is still adding (the same records as admin steps 31 + 32): chips, main marked, +N more ›, the blue row + pill only while something's left, links on one line, Change something");
