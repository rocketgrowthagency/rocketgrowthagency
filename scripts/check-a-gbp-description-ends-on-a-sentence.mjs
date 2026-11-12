#!/usr/bin/env node
// check-a-gbp-description-ends-on-a-sentence.mjs — THE GOOGLE DESCRIPTION NEVER STOPS MID-SENTENCE (content and AI master #12,
// approved 11-11, finding A3).
//
// 🔴 WHY: when the model ran past Google's 750 characters, flow-execute's m1.gbp.business_description kept the first 747 and added
// "...", so the words a client was asked to approve, for their public listing, stopped mid-sentence.
// 🔑 CHRIS'S RULE (decision 3): ask the model again with the limit; if it still runs long, cut at the last full sentence that fits;
// if no full sentence fits, there is no draft (the step says so), never a broken one.
// SELF-PROVING on the real website _gbp-description.js, with fixtures that are not shaped like one client: trades, places with
// abbreviations ("St. Louis", "Dr. Patel", "U.S."), a decimal ("4.9"), an exclamation, a question, a draft the model cut off
// ([[TRUNCATED…]]), one endless sentence, and the model answering long twice. And STATIC on the step: it uses draftDescription,
// says "indeterminate" when no draft fits, and nothing in it slices to 747 or adds "...".
// Exit 0 = every description ends on a sentence · 1 = one can be cut mid-sentence · 2 = INDETERMINATE.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const idk = (m) => { console.error(`⚠️  INDETERMINATE — ${m}`); process.exit(2); };
const F = [];
const fail = (m) => F.push(m);
const read = (r) => { try { return fs.readFileSync(path.join(SITE, r), "utf8"); } catch { idk(`cannot read ${r}`); } };
const require = createRequire(path.join(SITE, "netlify/functions/_gbp-description.js"));
let D; try { D = require("./_gbp-description.js"); } catch (e) { idk(`_gbp-description.js won't load: ${String(e.message).slice(0, 120)}`); }
if (D.LIMIT !== 750) fail(`the limit is ${D.LIMIT}, not Google's 750`);
const endsWell = (s) => /[.!?]["')\]]?$/.test(s) && !/\.\.\.$|…$/.test(s);

const S = {
  plumber: "Rivera Plumbing fixes leaks, clogged drains and water heaters across St. Louis and the nearby suburbs. ",
  dentist: "Dr. Patel and the team at Bright Smile Dental offer cleanings, fillings and crowns for families in Leeds. ",
  roofer: "We have kept roofs dry in Cape Town for twenty years, with repairs, replacements and gutter work. ",
  rating: "Clients rate the shop 4.9 out of 5 on Google, and the U.S. office answers every call the same day. ",
  shout: "Same-day service is our promise! ",
  ask: "Need a quote before the weekend? ",
  close: "Call or book online and a real person will get back to you within the hour.",
};
const long = Object.values(S).join("").repeat(3);   // well past 750, many sentence ends
// cutAtSentence
const c1 = D.cutAtSentence(long);
if (!c1 || c1.length > 750 || !endsWell(c1)) fail(`a long description isn't cut at a sentence end within 750 (${c1 ? c1.length : "none"} chars, ends "${c1 ? c1.slice(-12) : ""}")`);
if (c1) { const next = long.slice(c1.length).search(/[.!?](\s|$)/); if (next >= 0 && c1.length + next + 1 <= 750 && /\s/.test(long[c1.length + next + 1] || " ") && !/^(St|Dr|U\.S)$/.test(long.slice(0, c1.length + next + 1).trim().split(/\s+/).pop().replace(/\.$/, ""))) fail("the cut isn't the LAST full sentence that fits (a whole sentence more would fit)"); }
const st = D.cutAtSentence("Rivera Plumbing has served homes and businesses across the whole metro for many years with leak repair, drain cleaning and water heater installs from St. Louis to the far suburbs, and " + "every job comes with a written price before any work starts and a follow-up call a week later to make sure it holds up " .repeat(8));
if (st && /St\.$/.test(st)) fail("a description is cut after \"St.\" (an abbreviation is not a sentence end)");
const dr = D.cutAtSentence("Bright Smile Dental has welcomed local families for many years with gentle cleanings and fillings, so call Dr. Patel for a visit " + "x".repeat(800));
if (dr !== null && /Dr\.$/.test(dr)) fail("a description is cut after \"Dr.\"");
if (D.cutAtSentence("one endless clause about the business and its services ".repeat(20)) !== null) fail("a description with no sentence end inside the limit is cut anyway (it would end mid-sentence)");
const tr = D.cutAtSentence(`${S.plumber}${S.close} And then the model kept going with half a`.concat("\n\n[[TRUNCATED: this draft hit the token ceiling and is INCOMPLETE — do not publish or approve it.]]"));
if (!tr || /TRUNCATED|half a$/.test(tr) || !endsWell(tr)) fail("a draft the model cut off keeps its half sentence or its marker");
const ex = D.cutAtSentence(`${S.shout}${S.ask}${S.dentist}`.repeat(6));
if (!ex || !endsWell(ex) || ex.length > 750) fail("a description of exclamations and questions isn't cut at one");
const dec = D.cutAtSentence(`${S.rating}${S.roofer}`.repeat(6));
if (!dec || /4\.$|U\.$/.test(dec)) fail("a description is cut inside \"4.9\" or \"U.S.\"");

// draftDescription: at most two model calls, never "..."
const run = async (answers) => { let i = 0; const asks = []; const out = await D.draftDescription(async (extra) => { asks.push(extra); return answers[Math.min(i++, answers.length - 1)]; }); return { out, asks }; };
let r = await run([S.plumber + S.close]);
if (r.asks.length !== 1 || r.out.text !== (S.plumber + S.close).trim() || r.out.redrafted) fail("a draft that fits is asked for again or changed");
r = await run([long, S.dentist + S.close]);
if (r.asks.length !== 2 || !/750/.test(r.asks[1]) || r.out.text !== (S.dentist + S.close).trim() || !r.out.redrafted || r.out.cut) fail("a long draft isn't asked for again with the limit, or the fitting redraft isn't kept");
r = await run([long, long]);
if (r.asks.length !== 2 || !r.out.text || r.out.text.length > 750 || !endsWell(r.out.text) || !r.out.cut) fail("two long drafts don't end at the last full sentence that fits");
r = await run(["one endless clause about the business ".repeat(30), "one endless clause about the business ".repeat(30)]);
if (r.out.text !== null || !/no full sentence fit/.test(r.out.said || "")) fail("two long drafts with no sentence end produce a broken draft instead of none");
r = await run([`${S.roofer}${S.close} and half a`.concat("\n\n[[TRUNCATED: x]]"), S.roofer + S.close]);
if (r.asks.length !== 2 || /TRUNCATED/.test(r.out.text || "")) fail("a draft the model cut off is kept instead of asked for again");

// the step itself
const fe = read("netlify/functions/flow-execute.js");
const a = fe.indexOf('"m1.gbp.business_description": async'), b = fe.indexOf('"m1.gbp.services_products": async', a);
if (a < 0 || b < 0) idk("flow-execute has no m1.gbp.business_description step");
const step = fe.slice(a, b).split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
if (!/D\.draftDescription\(/.test(step)) fail("the description step doesn't use draftDescription (redraft, then a sentence end)");
if (/slice\(0,\s*7\d\d\)|\+\s*["']\.\.\.["']|…/.test(step)) fail("the description step still cuts to a length and adds \"...\"");
if (!/if \(!out\.text\) return \{ summary: out\.said, outcome: "indeterminate" \}/.test(step)) fail("the description step saves a draft when no full sentence fit");
if (!/outcome_data: \{ draft: out\.text \}/.test(step)) fail("the description step saves something other than the fitted draft");

if (F.length) { console.error(`🔴 a Google description can stop mid-sentence:\n${F.map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ a Google description ends on a sentence: a long draft is asked for again with the limit, then cut at the last full sentence that fits (St., Dr., U.S. and 4.9 are not ends); no fit means no draft, never \"...\"");
