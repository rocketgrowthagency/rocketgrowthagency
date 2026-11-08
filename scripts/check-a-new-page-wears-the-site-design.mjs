#!/usr/bin/env node
/**
 * check-a-new-page-wears-the-site-design.mjs — A NEW PAGE IS BUILT IN THE SITE'S OWN DESIGN (approved page_builder_site_design_v1, the owner 11-7).
 * RGA's Local SEO Audit page came out as the header and footer with plain text between ("the design i saw was not that good"). Now the
 * closest real page gives its whole main area and only the words change, slot by slot; what belongs only to that page goes.
 * Fixtures are a made-up plumber's site (not RGA's): a service page with a hero picture, cards, numbered steps, a sample report, a FAQ
 * and a trust band, and a second page that shares the trust band and section labels.
 *   the slots are read (nothing inside an <svg> or a picture) · placing the template's own words gives the template back exactly ·
 *   a dropped slot takes its empty card with it · pictures go · a link to the new page points at the template page · the fit's rules
 *   (count, headline kept and naming the page, no kept words unless the site shows them in the same place, no new number, length,
 *   mostly dropped) · the fit follows every fix of the lines (button, a removed promise) and a stale fit is dropped · the cleaner keeps
 *   it on a new page only · the build uses it only while it's for these words and that page, else the plain page and why.
 * Exit 0 = holds. 1 = doesn't. 2 = couldn't tell.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const req = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(SITE, p), "utf8");
let PD, SC, AR, AD, FE;
try { PD = req(path.join(SITE, "netlify/functions/_page-design.js")); SC = req(path.join(SITE, "shared/site-change.js")); AR = req(path.join(SITE, "netlify/functions/_website-autorun.js"));
  AD = read("netlify/functions/admin-deliverables.js"); FE = read("netlify/functions/flow-execute.js"); }
catch (e) { console.error(`⚠️  INDETERMINATE — couldn't load the page design: ${e.message}`); process.exit(2); }
const bad = [], fail = (m) => bad.push(m);

const page = (title, main) => `<html><head><title>${title}</title></head><body><header><nav><a href="/">Acme Plumbing</a></nav></header><main>${main}</main><footer>Acme Plumbing · (555) 010-2000</footer></body></html>`;
const TPL_MAIN = `
<section class="hero"><p class="eyebrow">Drain Cleaning</p><h1>Drain cleaning in <span class="hl">Springfield</span></h1><p class="lead">We clear slow and blocked drains for homes in Springfield.</p>
  <a class="btn" href="/contact/">Book a visit</a><div class="card" aria-label="Sample drain report"><img src="/img/drain.jpg" alt="A drain"><p class="cap">Sample report, made-up home.</p><ul><li>Kitchen sink</li><li>Main line</li></ul></div></section>
<section><p class="eyebrow">What You Get</p><h2>Clear drains that stay clear</h2><figure class="team"><img src="/img/team.jpg" alt="Our team"><figcaption>Our drain crew at work</figcaption></figure><div class="cards"><div class="c"><svg><text>icon</text></svg><h3>Camera check</h3><p>We look inside the pipe first.</p></div><div class="c"><h3>Hydro jetting</h3><p>High pressure water clears the line.</p></div></div></section>
<section><p class="eyebrow">How It Works</p><h2>Look, clear, test</h2><ol><li><span class="n">1</span><h3>Look</h3><p>We find the blockage.</p></li><li><span class="n">2</span><h3>Clear</h3><p>We clear it.</p></li></ol></section>
<section class="sample"><h2>Your drain report</h2><p>Scores from 0 to 100 for each line.</p><span class="score">72</span></section>
<section><p class="eyebrow">Related</p><a href="/services/water-heaters/">Water heaters &rarr;</a><a href="/services/leak-detection/">Leak detection</a></section>
<section><p class="eyebrow">FAQ</p><details><summary>Do you work weekends?</summary><p>Yes, on Saturdays by appointment.</p></details><details><summary>Is the camera check extra?</summary><p>It comes with every visit.</p></details></section>
<section class="trust"><span>Licensed and insured plumbers</span><span>Upfront quotes</span></section>`;
const OTHER_MAIN = `<section><p class="eyebrow">Water Heaters</p><h1>Water heaters in Springfield</h1><p class="eyebrow">What You Get</p><p class="eyebrow">How It Works</p><a href="/services/drain-cleaning/">Drain Cleaning</a><p class="eyebrow">FAQ</p></section><section class="trust"><span>Licensed and insured plumbers</span><span>Upfront quotes</span></section>`;
const TPL = page("Drain Cleaning | Acme Plumbing", TPL_MAIN), OTHER = page("Water Heaters | Acme Plumbing", OTHER_MAIN);
const TPL_URL = "https://acme.test/services/drain-cleaning/", NEW_URL = "https://acme.test/services/leak-detection/";

// the slots
const tpl = PD.pickTemplate([{ url: TPL_URL, html: TPL }], { minSlots: 5 });
if (!tpl) fail("a service page with a main area and a headline isn't picked as the template");
else {
  const texts = tpl.slots.map((s) => s.text);
  if (texts.includes("icon")) fail("words inside an <svg> are read as a slot");
  if (texts.includes("A drain") || !texts.includes("Sample report, made-up home.")) fail("the slots aren't read as written (a picture's alt read, or a caption missed)");
  if (tpl.subject !== "Drain Cleaning") fail(`the template's subject isn't read from its title ("${tpl.subject}")`);
  if (PD.renderMain(tpl.main, texts).html !== tpl.main.replace(/<figure[\s\S]*?<\/figure>/g, "").replace(/<img[^>]*>/g, "").replace(/ aria-label="Sample drain report"/, "")) fail("placing the template's own words doesn't give the template back exactly, less its pictures and its parts' labels (the layout is changed by the build)");
  const shared = PD.sharedLines(tpl, [OTHER]);
  if (!PD.sharedLines(tpl, [page("Pipes | Acme", "<div><b>Licensed and insured plumbers</b></div>")]).includes("span|licensed and insured plumbers")) fail("a call-to-action line the site's other pages show in another place isn't the site's (4+ words)");
  if (PD.sharedLines(tpl, [page("Pipes | Acme", "<div><b>Drain Cleaning</b></div>")]).includes("p|drain cleaning")) fail("a short label shown elsewhere in another place counts as the site's (it's how 'GBP Optimization' got through)");
  if (!shared.includes("span|licensed and insured plumbers") || !shared.includes("p|what you get") || shared.includes("p|drain cleaning")) fail("the site's shared lines aren't told apart by place (a trust band shared; another page's LINK 'Drain Cleaning' isn't this page's label)");

  // a good fit for the new page about leak detection
  const ix = (t) => texts.indexOf(t);
  const fit = texts.map((t) => t);
  const set = (t, v) => { fit[ix(t)] = v; };
  set("Drain Cleaning", "Leak Detection"); set("Drain cleaning in", "Leak detection in"); set("We clear slow and blocked drains for homes in Springfield.", "We find hidden leaks in Springfield homes before they do damage.");
  set("Book a visit", "Book a leak check"); set("Sample report, made-up home.", ""); set("Kitchen sink", ""); set("Main line", "");
  set("Clear drains that stay clear", "Leaks found without tearing walls open"); set("Camera check", "Acoustic listening"); set("We look inside the pipe first.", "We listen for water moving where it shouldn't.");
  set("Hydro jetting", "Thermal imaging"); set("High pressure water clears the line.", "A heat camera shows wet spots behind walls.");
  set("Look, clear, test", "Listen, find, fix"); set("Look", "Listen"); set("We find the blockage.", "We trace the sound."); set("Clear", "Find"); set("We clear it.", "We mark the spot.");
  set("Your drain report", ""); set("Scores from 0 to 100 for each line.", ""); set("72", "");
  set("Related", "Related"); set("Water heaters →", "Water heaters →"); set("Leak detection", "Drain cleaning");
  set("Do you work weekends?", "Do you work weekends?"); set("Yes, on Saturdays by appointment.", "Yes, on Saturdays by appointment."); set("Is the camera check extra?", "Do you cut into walls?"); set("It comes with every visit.", "Only when the leak is found and you say yes.");
  const content = "Leak detection. Saturdays by appointment. Water heaters. Drain cleaning. Acme Plumbing serves Springfield.";
  const sharedAll = [...shared, "p|related", "summary|do you work weekends?", "p|yes, on saturdays by appointment.", "a|water heaters →"];
  const ok = PD.checkFit({ slots: fit }, tpl, { pageFor: "Leak detection", content, shared: sharedAll });
  if (ok.problems) fail(`a good fit is refused: ${ok.problems.join("; ")}`);
  // each bad fit differs from the good one in ONE slot, so the rule it names is the one that caught it
  const chk = (f, o = {}) => PD.checkFit({ slots: f }, tpl, { pageFor: "Leak detection", content, shared: sharedAll, ...o }).problems || [];
  if (!chk(fit.slice(1)).some((p) => /answered/.test(p))) fail("a fit with the wrong number of slots passes");
  // keyed by slot number (RGA's first real run answered 68 for 66 slots as a list)
  { const keyed = Object.fromEntries(fit.map((x, i) => [String(i), x]));
    const kp = (o) => PD.checkFit({ slots: o }, tpl, { pageFor: "Leak detection", content, shared: sharedAll });
    if (kp(keyed).problems) fail(`a good fit keyed by slot number is refused: ${kp(keyed).problems.join("; ")}`);
    const miss = { ...keyed }; delete miss["3"]; if (!(kp(miss).problems || []).some((p) => /no answer for slot 3/.test(p))) fail("a keyed fit missing a slot passes");
    if (!(kp({ ...keyed, [String(fit.length)]: "x" }).problems || []).some((p) => /don't exist/.test(p))) fail("a keyed fit with a slot that doesn't exist passes"); }
  { const f = [...fit]; tpl.slots.forEach((s, i) => { if (s.tag === "h1") f[i] = ""; }); if (!chk(f).some((p) => /headline was dropped/.test(p))) fail("a fit that drops the headline passes"); }
  { const f = [...fit]; f[ix("Drain cleaning in")] = "Plumbing help in"; if (!chk(f).some((p) => /doesn't name/.test(p))) fail("a headline that doesn't name the page passes"); }
  { const f = [...fit]; f[ix("We look inside the pipe first.")] = "We look inside the pipe first."; if (!chk(f).some((p) => /kept the other page's words/.test(p))) fail("a line kept from the template page passes"); }
  { const f = [...fit]; f[ix("Drain Cleaning")] = "Drain Cleaning"; if (!chk(f).some((p) => /kept the other page's words|still says what the other page is about/.test(p))) fail("the template's own label kept word for word passes (it's another page's LINK, not a shared label)"); }
  { const f = [...fit]; f[ix("Clear drains that stay clear")] = "Drain cleaning and leaks, found fast"; if (!chk(f).some((p) => /still says what the other page is about/.test(p))) fail("a heading that still names what the template page is about passes"); }
  { const f = [...fit]; f[ix("We find the blockage.")] = "We find 9 out of 10 leaks."; if (!chk(f).some((p) => /adds a number \(9\)/.test(p))) fail("a fit that adds a number passes"); }
  { const f = [...fit]; f[ix("We find the blockage.")] = "We trace the sound. ".repeat(12); if (!chk(f).some((p) => /far longer/.test(p))) fail("a slot far longer than its place passes"); }
  { const f = fit.map((x, i) => (tpl.slots[i].tag === "h1" ? x : "")); if (!chk(f).some((p) => /were dropped/.test(p))) fail("a fit that drops most of the page passes"); }

  // the page as built
  const r = PD.renderMain(tpl.main, fit, { selfPath: "/services/leak-detection/", templatePath: "/services/drain-cleaning/" });
  if (!r.html) fail("a good fit isn't placed");
  else {
    if (/<img|<figure|Our drain crew|Sample report|Kitchen sink|class="card"/.test(r.html)) fail("the template's picture or its sample card survives (a card whose words were all dropped must go)");
    if (/class="sample"|Your drain report|72/.test(r.html)) fail("a section whose words were all dropped survives as an empty box");
    if (/aria-label="Sample drain report"/.test(r.html)) fail("a label the template gave its own part survives");
    if (/href="\/services\/leak-detection\/"/.test(r.html) || !/href="\/services\/drain-cleaning\/">Drain cleaning</.test(r.html)) fail("a link to the new page itself isn't pointed at the template page");
    if (!/<span class="n">1<\/span><h3>Listen<\/h3>/.test(r.html) || !/<svg><text>icon<\/text><\/svg><h3>Acoustic listening/.test(r.html) || !/Licensed and insured plumbers/.test(r.html)) fail("the layout isn't kept (step numbers, icons, the trust band)");
    if (!/Leak detection in <span class="hl">Springfield<\/span>/.test(r.html)) fail("a headline's parts lose their own styling");
  }
  if (!PD.renderMain(tpl.main, fit.slice(1)).error) fail("a fit for a different layout is placed");

  // the fit follows every fix of the lines
  const items = [{ label: "Main headline", after: "Leak detection in Springfield" }, { label: "Opening", after: "We find hidden leaks. We come out the same day." }, { label: "Main button", after: "Book a leak check" }];
  const fit2 = [...fit]; fit2[ix("We clear slow and blocked drains for homes in Springfield.")] = "We find hidden leaks in Springfield homes. We come out the same day.";
  const before = { kind: "copy", items, searches: [], design: { template_url: TPL_URL, template_key: PD.templateKey(tpl.main), slots: fit2, items_key: PD.itemsKey(items) } };
  const afterItems = [{ ...items[0] }, { label: "Opening", after: "We find hidden leaks." }, { label: "Main button", after: "Get a leak check" }];
  const f1 = PD.designFollows(SC, before, { ...before, items: afterItems }, {});
  if (!f1.design) fail(`a fix of the lines drops the page's design (${f1.design_skipped})`);
  else {
    if (f1.design.slots.some((x) => /same day/.test(x))) fail("a promise taken out of the lines stays on the page as built");
    if (f1.design.slots[ix("We clear slow and blocked drains for homes in Springfield.")] !== "We find hidden leaks in Springfield homes.") fail("the page's own fix doesn't take the promise's sentence out the way the lines' fix does");
    if (!f1.design.slots.includes("Get a leak check") || f1.design.slots.includes("Book a leak check")) fail("a swapped button stays the old one on the page as built");
    if (f1.design.items_key !== PD.itemsKey(afterItems)) fail("the design isn't re-keyed to the fixed lines (the build would call it stale)");
  }
  const stale = PD.designFollows(SC, { ...before, design: { ...before.design, items_key: "edited" } }, before, {});
  if (stale.design || !/edited after/.test(stale.design_skipped || "")) fail("a fit for words that were edited after is kept");
  const fit3 = [...fit]; fit3[ix("We find the blockage.")] = "We guarantee we find every leak.";
  const f3 = PD.designFollows(SC, { ...before, design: { ...before.design, slots: fit3 } }, before, {});
  if (f3.design && f3.design.slots.some((x) => /guarantee/.test(x))) fail("the page as built keeps a claim the lines' checks refuse");
  const gotSync = await AR.checkAndFix({ siteText: async () => "" }, { id: "c" }, before);
  if (!gotSync.change.design || gotSync.change.design.slots.some((x) => /same day/.test(x))) fail("checkAndFix doesn't carry the fix onto the page as built");
}

// the cleaner, the draft, the build
const cleaned = SC.cleanChange("m1.web.priority_pages", { kind: "copy", new_page: true, page_url: NEW_URL, files: [{ path: "services/leak-detection/index.html", action: "add" }], items: [{ label: "Main headline", after: "x" }], design: { template_url: TPL_URL, template_key: "k", items_key: "i", slots: ["a — b", ""] } });
if (!SC.STEPS["m1.web.priority_pages"]) fail("the priority pages step moved (the cleaner case needs a new-page step)");
else if (!cleaned.change || !cleaned.change.design || cleaned.change.design.slots[0] !== SC.noDashes("a — b")) fail("the cleaner drops a new page's design, or keeps an em dash in it");
if (!/page_draft\.design = fit\.design; else page_draft\.design_skipped = fit\.why/.test(FE) || !/for \(let n = 0; n < 3; n\+\+\)/.test(FE.slice(FE.indexOf("async function fitDesign"), FE.indexOf("async function fitDesign") + 3000))) fail("the draft doesn't fit the words to the site's design (two more tries, else the plain page and why)");
if (!/SiteChange\.duplicateSentences\(changed\.join/.test(FE) || !/SiteChange\.autoChecks\(line, \{ siteText \}\)/.test(FE)) fail("the fitted words don't pass the same checks as the draft (claims, timing, copying from their pages)");
if (!/c\.design = \{ \.\.\.od\.page_draft\.design, items_key: require\("\.\/_page-design"\)\.itemsKey\(c\.items\) \}/.test(AD)) fail("the draft reader doesn't carry the design, keyed to its lines");
if (!/PD\.templateKey\(tplMain\) !== c\.design\.template_key \? "its template page changed/.test(AD) || !/PD\.itemsKey\(c\.items\) !== c\.design\.items_key \? "the words were edited/.test(AD)) fail("the build uses a fit whose template page changed or whose words were edited");
if (!/else design = \{ skipped: why/.test(AD) || !/\.\.\.\(design \? \{ design \} : \{\}\)/.test(AD)) fail("a build that can't use the design doesn't say why");

if (bad.length) { console.error(`❌ a new page in the site's design — ${bad.length} regression(s):`); for (const b of bad) console.error(`  · ${b}`); process.exit(1); }
console.log("✅ a new page wears the site's design: the closest page's whole layout, words swapped slot by slot (template back exactly when unchanged), pictures and emptied cards go, a self-link points at the template, the fit's rules (count, headline, no kept words unless shared in place, no new number, length), the fit follows every fix and a stale one is dropped, the build says why it fell back");
