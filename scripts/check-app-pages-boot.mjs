#!/usr/bin/env node
/**
 * check-app-pages-boot.mjs — the app pages must actually COME UP in a browser.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-11. The admin was a white page for a full day. `check-browser-js-parses-as-the-browser-
 * does.mjs` now blocks the deploy that caused it — but that gate only proves the source PARSES.
 *
 * 🔴 A runtime error produces the identical symptom. A null dereference while rendering, a missing
 * DOM hook, a module that throws on import — every one of those is a blank screen with perfectly
 * valid syntax. When that gate was added the limit was written down honestly; this closes it.
 *
 * 🔑 It loads the LIVE pages, not a synthetic mount. That distinction is exactly how a dead admin
 * stayed green for a day: `check-playbook-renders.mjs` opens a real browser but mounts playbook.js
 * against a hand-built page, so it could never have seen admin.js fail.
 *
 * Signed OUT is fine and is the point — a login screen rendering proves the bundle parsed,
 * executed, and painted. What it cannot prove is that the signed-in views render, which needs a
 * session and is stated as a limit rather than quietly skipped.
 *
 * Exit 0 = every page boots · 1 = a page is blank or threw · 2 = could not run the browser.
 */
// 🔑 URLs can be passed as arguments, which is how this gate gets SABOTAGE-TESTED: point it at a
// local page whose module has a deliberate syntax error and confirm it goes red. A detector nobody
// has watched detect anything is trusted on faith.
//   node scripts/check-app-pages-boot.mjs file:///tmp/blank.html
const OVERRIDE = process.argv.slice(2).filter((a) => /^(https?|file):/.test(a));

const PAGES = OVERRIDE.length ? OVERRIDE.map((url) => ({ url, expect: null, what: "override" })) : [
  { url: "https://www.rocketgrowthagency.com/admin/",        expect: /log ?in|sign ?in|password/i, what: "admin" },
  { url: "https://www.rocketgrowthagency.com/portal/",       expect: /log ?in|sign ?in|portal|email/i, what: "client portal" },
  { url: "https://www.rocketgrowthagency.com/client-login/", expect: /log ?in|sign ?in|email/i, what: "client login" },
  { url: "https://www.rocketgrowthagency.com/",              expect: /rocket|growth|seo/i, what: "homepage" },
];
const MIN_CHARS = 40;

let puppeteer;
try { ({ default: puppeteer } = await import("puppeteer")); }
catch {
  // 🔑 No browser = we did not check. Exit 2, never 0. → feedback_exit_code_semantics_for_gates
  console.log("  ⚠️  puppeteer unavailable — cannot verify the pages boot. NOT reporting healthy.");
  process.exit(2);
}

console.log("── the app pages actually come up in a browser ──");

let browser;
try { browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] }); }
catch (e) { console.log(`  ⚠️  could not launch a browser: ${e.message}`); process.exit(2); }

let fails = 0, indeterminate = 0;

for (const page of PAGES) {
  const errs = [];
  const thirdParty = [];
  const p = await browser.newPage();
  const cdp = await p.target().createCDPSession();
  await cdp.send("Debugger.enable").catch(() => {});
  await cdp.send("Runtime.enable").catch(() => {});
  cdp.on("Debugger.scriptFailedToParse", (s) => errs.push(`FAILED TO PARSE ${String(s.url).split("/").pop()}`));

  // 🔴 ATTRIBUTE BEFORE JUDGING. The first version failed on ANY uncaught error, and the first
  // thing it flagged was Cloudflare Turnstile throwing 600010 on the homepage — which is Turnstile
  // refusing HEADLESS CHROME as a bot. Exactly correct behaviour from a bot-protection widget, and
  // a page that rendered perfectly well. A gate that cries wolf gets muted, so the origin of the
  // error decides: OUR script is a failure, a third-party widget on a page that still paints is
  // information. → feedback_a_check_must_not_validate_itself
  // 🔑 `pageerror` does not carry the source URL; Runtime.exceptionThrown does. That is the whole
  // reason this listens to CDP rather than puppeteer's friendlier event.
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails: d }) => {
    const from = d.url || "";
    const msg = (d.exception?.description || d.text || "").split("\n")[0].slice(0, 120);
    const ours = !from || from.includes("rocketgrowthagency.com");
    if (ours) errs.push(`uncaught in ${from ? from.split("/").pop() : "an inline script"}: ${msg}`);
    else thirdParty.push(`${new URL(from).host}: ${msg}`);
  });
  // A LOCAL script that never arrives is our problem. A CDN outage is not, and must not turn into
  // a red gate on our side — it is reported, not failed.
  const cdnMisses = [];
  p.on("requestfailed", (r) => {
    const u = r.url();
    if (!/\.(js|mjs)(\?|$)/i.test(u)) return;
    if (u.includes("rocketgrowthagency.com")) errs.push(`our script failed to load: ${u.split("/").pop()}`);
    else cdnMisses.push(u.split("/")[2]);
  });

  let info = null, loadErr = null;
  try {
    const res = await p.goto(page.url, { waitUntil: "networkidle2", timeout: 45000 });
    if (!res || res.status() >= 400) loadErr = `HTTP ${res ? res.status() : "no response"}`;
    else {
      await new Promise((r) => setTimeout(r, 2500));   // let the app paint
      info = await p.evaluate(() => ({
        chars: document.body.innerText.trim().length,
        text: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 400),
      }));
    }
  } catch (e) { loadErr = e.message.slice(0, 100); }
  await p.close().catch(() => {});

  const label = `${page.what} (${new URL(page.url).pathname})`;
  if (loadErr) {
    // Could not reach it — that is "could not tell", not "the page is broken".
    console.log(`  ⚠️  ${label.padEnd(34)} could not load: ${loadErr}`);
    indeterminate++;
    continue;
  }
  const problems = [];
  if (errs.length) problems.push(errs[0]);
  if (info.chars < MIN_CHARS) problems.push(`renders only ${info.chars} visible characters — effectively blank`);
  else if (page.expect && !page.expect.test(info.text)) {
    problems.push(`rendered, but nothing matching ${page.expect} — it may be an error page`);
  }

  if (problems.length) {
    console.log(`  🔴 ${label.padEnd(34)} ${problems[0]}`);
    if (problems[1]) console.log(`       ${problems[1]}`);
    fails++;
  } else {
    console.log(`  ✅ ${label.padEnd(34)} booted · ${info.chars} chars rendered`);
    if (cdnMisses.length) console.log(`       ℹ️  third-party script(s) did not load: ${[...new Set(cdnMisses)].join(", ")}`);
    // Surfaced, never silently dropped — if a widget starts failing for real users too, the note is
    // already on the record rather than being discovered fresh. → feedback_dead_check_selector_gap
    for (const t of [...new Set(thirdParty)].slice(0, 3)) console.log(`       ℹ️  third-party error (page still painted): ${t}`);
  }
}

await browser.close().catch(() => {});

if (fails) {
  console.log(`\n🔴 ${fails} app page(s) do not come up. A visitor sees a white screen.`);
  console.log("   Syntax is already gated — so suspect a RUNTIME error: open the page headless and");
  console.log("   read Runtime.exceptionThrown for the file, line and column.");
  process.exit(1);
}
if (indeterminate) {
  console.log(`\n⚠️  ${indeterminate} page(s) could not be reached — not a pass.`);
  process.exit(2);
}
console.log(`\n✅ all ${PAGES.length} app page(s) boot and paint. (Signed-OUT views; signed-in rendering is not covered.)`);
process.exit(0);
