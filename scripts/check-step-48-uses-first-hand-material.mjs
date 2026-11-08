#!/usr/bin/env node
/**
 * check-step-48-uses-first-hand-material.mjs — STEP 48'S POSTS ARE FIRST-HAND, FROM MORE OF THE CLIENT'S OWN MATERIAL (approved
 * website_steps_46_50_research_v1, the owner 11-7). No independent study shows blogging alone lifts local rankings; posts help when
 * they're first-hand and support a service page. The rule stays (nothing invented, no material = no post); the material now also
 * comes from the client's own published photos (with what's in them) and the questions people search for in their Search Console.
 * Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
let FE; try { FE = fs.readFileSync(path.join(SITE, "netlify/functions/flow-execute.js"), "utf8"); } catch { console.error("⚠️  INDETERMINATE — couldn't read flow-execute"); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);
const at = FE.indexOf("async function blogFromMaterial(client) {"), body = at < 0 ? "" : FE.slice(at, at + 9000);
if (!body) { console.error("⚠️  INDETERMINATE — step 48's drafter moved"); process.exit(2); }
if (!/const facts = \[\.\.\.facts0, \.\.\.photoFacts\.slice\(0, 3\), \.\.\.asked\];/.test(body)) fail("the post's material is only the page-proof step (their photos and searched questions aren't read)");
if (!/if \(h && h\.published && h\.change\) for \(const it of h\.change\.items \|\| \[\]\) if \(it\.after && it\.src\) photoFacts\.push/.test(body)) fail("a photo counts as material before it's published with its description");
const q = (body.match(/const QUESTION = (\/[^\n]+\/i);/) || [])[1];
let QUESTION = null; try { QUESTION = q ? new Function(`return ${q};`)() : null; } catch { QUESTION = null; }
if (!QUESTION || !QUESTION.test("how much does drain cleaning cost") || !QUESTION.test("why is my water heater leaking") || QUESTION.test("plumber springfield") || QUESTION.test("drain cleaning near me")) fail("a searched question isn't told apart from a plain search");
if (!/&& \(Number\(r\.impressions\) \|\| 0\) >= 5\)/.test(body)) fail("a question almost nobody searched counts as material");
if (!/Their material \(the only facts you may use\)/.test(body)) fail("the post may use facts beyond the client's own material");
if (!/return r && r\.outcome === "noop" && od\.posts === 0 && !od\.on_its_way \? \{ \.\.\.r, outcome: "verified", completed: true \} : r;/.test(FE)) fail("step 48's '0 posts' (no first-hand material) never finishes the step, so step 50 waits on it forever (or a post on its way finishes it)");
if (bad.length) { console.error(`❌ step 48's material — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ step 48 stays first-hand: its material is the client's result and customer words, their published photos with what's in them, and questions people really search for (5+ times); nothing beyond it is used");
