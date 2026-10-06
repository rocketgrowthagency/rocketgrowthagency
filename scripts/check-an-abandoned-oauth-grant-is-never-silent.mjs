#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — AN ABANDONED GOOGLE GRANT MUST NEVER BE SILENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-27, on a Google 400 after pressing Back: *"fyi when i click back?"* … *"fix it"* …
 * *"this error happened on the client portal"*.
 *
 * The 400 itself is Google's and unfixable from our origin — an OAuth consent token is single-use, so
 * Back re-submits a spent one. What WAS ours: abandoning, denying or backing out of the consent
 * screen never reaches `oauth-google-callback`, so the browser comes back with no result param at all
 * and both surfaces said NOTHING. The card kept offering "Connect" exactly as it does to someone who
 * has never tried. **"You have not done this" and "you tried and it failed" rendered identically.**
 * → feedback_an_absence_must_never_be_readable_as_a_value · feedback_every_action_must_report_its_result
 *
 * 🔑 WHY THIS GATE WALKS INSTEAD OF LISTING. The first fix stamped two navigation sites. There were
 * FOUR — the admin's per-client connect and the free/busy grant button were missed, because I fixed
 * the instances Chris had hit rather than the class. So this gate does not name the sites it knows
 * about: it FINDS every place either bundle navigates the browser to a Google consent URL, and fails
 * on any one that leaves without stamping. A new connect button added next month is covered by
 * construction. → feedback_fix_the_class_not_the_instance
 *   · feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
 *
 * WHAT IS PINNED (properties, not spellings or line numbers):
 *   1. Every OAuth-init fetch handler that navigates away stamps a `…OauthStarted` marker in
 *      localStorage BEFORE the navigation — after it would never run.
 *   2. Each surface's return path READS its marker, and produces a user-visible notice when the
 *      success param is absent.
 *   3. Each surface CLEARS the marker on every return, so a notice cannot nag twice.
 *   4. The marker EXPIRES. A browser reopened next week must not be told its grant "just" failed,
 *      so the read must compare the stamp against a bound.
 *   5. The portal clears the ADMIN's marker on `google_connected=1` — a client grant started from
 *      the admin lands in the portal, so without this a success is reported as an abandonment.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate (a file or handler shape this gate cannot read — never a
 * silent pass). Mutation-tested both directions; see the bottom of this file.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const WEB = `${__SITE}`;
const fail = [];
const indet = [];
const pass = [];

function read(rel) {
  const p = path.join(WEB, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} does not exist — cannot check it`); return null; }
  const src = fs.readFileSync(p, "utf8");
  if (src.length < 5000) { indet.push(`${rel} is only ${src.length} bytes — that is not the bundle`); return null; }
  return src;
}

// Brace-match forward from an index to the end of the enclosing block, so "before the navigation"
// is measured inside ONE handler and cannot run into the next listener.
// 🔴 A character window would lie here: these handlers vary from 8 to 60 lines.
// → feedback_a_gate_window_measured_in_characters_will_lie
function enclosingBody(src, idx) {
  // Walk back to the nearest `{` that opens a function/arrow body containing idx, by counting depth
  // backwards from idx to find the innermost unclosed `{`.
  let depth = 0;
  let open = -1;
  for (let i = idx; i >= 0; i--) {
    const c = src[i];
    if (c === "}") depth++;
    else if (c === "{") { if (depth === 0) { open = i; break; } depth--; }
  }
  if (open < 0) return null;
  // Then forward to its match.
  let d = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) return { start: open, end: i, text: src.slice(open, i + 1) }; }
  }
  return null;
}

// ── 1 + 2. EVERY NAVIGATION TO A GOOGLE CONSENT URL STAMPS FIRST ────────────────────────────────
// The navigation is recognised by its PROPERTY: an assignment to location.href inside a handler that
// fetched one of our oauth-*-init endpoints. Not by the variable name (`data.url` today), not by a
// line number, and not by the button's data attribute.
const NAV = /(?:window\s*\.)?location\s*\.href\s*=/g;
const INIT = /oauth-(?:google|rga)-init/;
const STAMP = /localStorage\s*\.\s*setItem\s*\(\s*["'`]rga\.[A-Za-z]*[Oo]authStarted["'`]/;

for (const rel of ["admin/admin.js", "portal/portal.js"]) {
  const src = read(rel);
  if (!src) continue;
  let found = 0;
  let m;
  NAV.lastIndex = 0;
  while ((m = NAV.exec(src))) {
    // 🔑 ASCEND to the handler, don't stop at the innermost brace. The navigation usually sits inside
    // `if (res.ok && data.url) { … }`, a block that says nothing about Google — so the first enclosing
    // block is the wrong unit to judge. Walk outward until a block names the init endpoint, which is
    // the handler that started the grant.
    let body = enclosingBody(src, m.index);
    let hops = 0;
    while (body && !INIT.test(body.text) && hops++ < 8) {
      const up = enclosingBody(src, Math.max(0, body.start - 1));
      if (!up || up.start >= body.start) break;
      body = up;
    }
    if (!body) { indet.push(`${rel}: could not brace-match the block around a location.href at offset ${m.index}`); continue; }
    // Only the handlers that START a Google grant are in scope. A location.href used for ordinary
    // navigation elsewhere in the bundle is not this gate's business.
    if (!INIT.test(body.text)) continue;
    found++;
    const before = src.slice(body.start, m.index);
    const line = src.slice(0, m.index).split("\n").length;
    if (!STAMP.test(before)) {
      fail.push(`${rel}:${line} — navigates to Google without stamping the attempt first. An abandoned `
        + `consent screen would be indistinguishable from never having tried. Stamp `
        + `localStorage "rga.<surface>OauthStarted" BEFORE the assignment.`);
    } else {
      pass.push(`${rel}:${line} — stamps before navigating`);
    }
  }
  if (found === 0) {
    indet.push(`${rel}: found no location.href inside a handler that fetches an oauth-*-init endpoint. `
      + `Either the connect flow was rewritten (update this gate) or the bundle did not load.`);
  }
}

// ── 3. THE ADMIN'S RETURN PATH, RUN FOR REAL ────────────────────────────────────────────────────
// 🔑 A STATIC SCAN CANNOT TELL WHICH BRANCH RAISES THE NOTICE. Asserting that the block "contains a
// notice" passes happily when the abandoned branch is deleted and only the success branch is left —
// which is exactly the defect. So the admin's queue IIFE is EXTRACTED and EXECUTED against a fake
// location/localStorage/history, and the gate asserts what it actually does in each case.
// → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works · feedback_a_gate_that_cannot_fail
{
  const src = read("admin/admin.js");
  const MARK = "(function queueRgaGoogleConnectNotice()";
  const at = src ? src.indexOf(MARK) : -1;
  if (src && at < 0) {
    fail.push("admin/admin.js — the boot-notice IIFE is gone. Nothing announces the result of an RGA "
      + "Google grant, abandoned or otherwise.");
  } else if (src) {
    const body = enclosingBody(src, src.indexOf("{", at));
    if (!body) indet.push("admin/admin.js: could not brace-match the boot-notice IIFE");
    else {
      const iife = src.slice(at, body.end + 1) + ")();";
      const run = (search, marker, nowOffsetMs = 0) => {
        const store = new Map();
        if (marker !== null) store.set("rga.adminOauthStarted", String(Date.now() - nowOffsetMs));
        const win = {
          location: { search, pathname: "/admin/", hash: "" },
          localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
          },
          history: { replaceState() {} },
          URLSearchParams, Date, Number, String, console,
        };
        win.window = win;
        vm.createContext(win);
        vm.runInContext(iife, win, { timeout: 2000 });
        return { notice: win.__rgaBootNotice || null, markerLeft: store.has("rga.adminOauthStarted") };
      };
      const SAYS_UNFINISHED = /didn.t finish|did not finish|didn.t complete|did not complete|never (?:finished|completed)/i;
      const text = (n) => !n ? "" : [n.message?.title, ...(n.message?.lines || [])].join(" ");
      try {
        // (a) Came back with NO result param and a fresh marker → it was abandoned. Say so.
        const a = run("", "fresh", 60 * 1000);
        if (!a.notice) fail.push("admin/admin.js — returning with no ?rga_google and a fresh attempt marker queues NO notice. An abandoned grant is silent.");
        else if (!SAYS_UNFINISHED.test(text(a.notice))) fail.push(`admin/admin.js — the abandoned-grant notice does not say the connection did not finish. It reads: "${text(a.notice)}"`);
        else pass.push("admin/admin.js — abandoned return: announces that the connection did not finish");
        if (a.markerLeft) fail.push("admin/admin.js — the attempt marker survives an abandoned return, so the notice can nag again on the next load.");

        // (b) A STALE marker must not be announced as a fresh failure.
        const b = run("", "stale", 90 * 60 * 1000);
        if (b.notice) fail.push(`admin/admin.js — a 90-minute-old marker still announces "${text(b.notice)}". A browser reopened later must not be told its grant just failed.`);
        else pass.push("admin/admin.js — a stale marker expires silently");
        if (b.markerLeft) fail.push("admin/admin.js — a stale marker is never cleared, so it lingers forever.");

        // (c) A SUCCESSFUL return must report success, never an abandonment.
        const c = run("?rga_google=connected&acct=hello@rocketgrowthagency.com", "fresh", 60 * 1000);
        if (!c.notice) fail.push("admin/admin.js — a successful grant queues no notice at all.");
        else if (SAYS_UNFINISHED.test(text(c.notice))) fail.push(`admin/admin.js — a COMPLETED grant is announced as unfinished: "${text(c.notice)}"`);
        else if (c.notice.type !== "success") fail.push(`admin/admin.js — a completed grant is announced as type "${c.notice.type}", not success.`);
        else pass.push("admin/admin.js — successful return: announces success, not abandonment");
        if (c.markerLeft) fail.push("admin/admin.js — a successful return leaves the marker set, so the next load claims it was abandoned.");

        // (d) Calendar withheld → an ERROR that persists, not a success.
        const d = run("?rga_google=noscope", null);
        if (!d.notice || d.notice.type !== "error") fail.push(`admin/admin.js — a grant that withheld Calendar is announced as "${d.notice ? d.notice.type : "nothing"}". Invites will fail; that must not auto-dismiss as a success.`);
        else pass.push("admin/admin.js — Calendar withheld: a persisting error");

        // (e) No param, no marker → the ordinary page load. It must stay silent.
        const e2 = run("", null);
        if (e2.notice) fail.push(`admin/admin.js — an ordinary page load with no attempt behind it announces "${text(e2.notice)}".`);
        else pass.push("admin/admin.js — an ordinary load stays silent");
      } catch (err) {
        indet.push(`admin/admin.js: the boot-notice IIFE would not run in isolation (${err.message}) — this gate cannot judge it`);
      }
    }
  }
}

// ── 4. THE PORTAL'S RETURN PATH, RUN FOR REAL ───────────────────────────────────────────────────
// Same treatment as the admin, and for the same reason: static checks of the inline version passed
// with the abandoned branch deleted (the expiry branch also cleared the marker, and other paths also
// raised a portalAlert). A mutation proved it, so the decision was pulled into
// resolveGoogleGrantOutcome() and is now EXECUTED here.
{
  const src = read("portal/portal.js");
  const NAME = "function resolveGoogleGrantOutcome(";
  const at = src ? src.indexOf(NAME) : -1;
  if (src && at < 0) {
    fail.push("portal/portal.js — resolveGoogleGrantOutcome() is gone. Nothing decides whether a Google "
      + "grant the client started ever came back.");
  } else if (src) {
    const body = enclosingBody(src, src.indexOf("{", at));
    if (!body) indet.push("portal/portal.js: could not brace-match resolveGoogleGrantOutcome()");
    else {
      const fn = src.slice(at, body.end + 1) + "\nglobalThis.__out = resolveGoogleGrantOutcome(__justLinked);";
      const run = (justLinked, marker, ageMs = 0) => {
        const store = new Map();
        if (marker === "fresh" || marker === "stale") {
          store.set("rga.oauthStarted", JSON.stringify({ at: Date.now() - ageMs, clientId: "c1" }));
        }
        if (marker === "adminToo") store.set("rga.adminOauthStarted", String(Date.now()));
        const ctx = {
          __justLinked: justLinked,
          localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: (k) => store.delete(k),
          },
          JSON, Date, Number, String, console,
        };
        vm.createContext(ctx);
        vm.runInContext(fn, ctx, { timeout: 2000 });
        return { out: ctx.__out || null, left: [...store.keys()] };
      };
      const SAYS_UNFINISHED = /didn.t finish|did not finish|didn.t complete|did not complete|never (?:finished|completed)/i;
      const text = (o) => !o ? "" : [o.title, o.message, o.consequence].filter(Boolean).join(" ");
      try {
        // (a) Back with no google_connected=1 and a fresh attempt → say it did not finish.
        const a = run(false, "fresh", 60 * 1000);
        if (!a.out) fail.push("portal/portal.js — a client who abandons Google's consent screen is told NOTHING. resolveGoogleGrantOutcome returned null for a fresh attempt that did not come back.");
        else if (!SAYS_UNFINISHED.test(text(a.out))) fail.push(`portal/portal.js — the abandoned-grant notice does not say the connection did not finish. It reads: "${text(a.out)}"`);
        else pass.push("portal/portal.js — abandoned return: tells the client it did not finish");
        if (a.left.includes("rga.oauthStarted")) fail.push("portal/portal.js — the marker survives an abandoned return, so the client is nagged again on the next load.");

        // (b) A STALE attempt must expire in silence.
        const b = run(false, "stale", 90 * 60 * 1000);
        if (b.out) fail.push(`portal/portal.js — a 90-minute-old attempt still tells the client "${text(b.out)}". A browser reopened later must not be told its connection just failed.`);
        else pass.push("portal/portal.js — a stale attempt expires silently");
        if (b.left.includes("rga.oauthStarted")) fail.push("portal/portal.js — a stale marker is never cleared, so it lingers forever.");

        // (c) A SUCCESSFUL return must be silent here (the green success card handles it) and must
        //     never be reported as an abandonment.
        const c = run(true, "fresh", 60 * 1000);
        if (c.out) fail.push(`portal/portal.js — a COMPLETED grant is reported as "${text(c.out)}".`);
        else pass.push("portal/portal.js — successful return: no abandonment claim");
        if (c.left.includes("rga.oauthStarted")) fail.push("portal/portal.js — a successful return leaves the marker set, so the next load claims it was abandoned.");

        // (d) 🔑 THE ADMIN'S MARKER IS CLEARED ON SUCCESS. oauth-google-callback sends every client
        //     grant here, including one an operator started from /admin/ — same origin, so the admin's
        //     marker is still set and its next load would announce a success as abandoned.
        const d = run(true, "adminToo");
        if (d.left.includes("rga.adminOauthStarted")) fail.push("portal/portal.js — a successful client grant does not clear \"rga.adminOauthStarted\". A connect started from the ADMIN lands here, so the admin's next load reports an abandonment that did not happen.");
        else pass.push("portal/portal.js — clears the admin's marker on a successful client grant");

        // (e) No attempt behind the load → silence.
        const e2 = run(false, null);
        if (e2.out) fail.push(`portal/portal.js — an ordinary page load with no attempt behind it tells the client "${text(e2.out)}".`);
        else pass.push("portal/portal.js — an ordinary load stays silent");
      } catch (err) {
        indet.push(`portal/portal.js: resolveGoogleGrantOutcome would not run in isolation (${err.message}) — this gate cannot judge it`);
      }
    }
  }
}

// ── 5. THE DECISION IS ACTUALLY ACTED ON ────────────────────────────────────────────────────────
// 🔴 A CORRECT DECISION NOBODY READS IS NOT A NOTICE. Running the resolver proves what it RETURNS;
// this proves the renderer calls it and hands the result to portalAlert. Without this the whole
// runtime test above could pass on dead code. → feedback_correct_is_not_the_same_as_happening
{
  const src = read("portal/portal.js");
  if (src) {
    // 🔴 ANCHOR ON THE ASSIGNMENT, NOT ON THE NAME. `indexOf("resolveGoogleGrantOutcome(justLinked…")`
    // lands on the function's own DEFINITION — the signature contains the call's exact spelling — so
    // everything measured after it described the wrong code and this check failed on a correct tree.
    // That is the seventh time a check in this repo anchored on a name's first occurrence.
    // → feedback_an_inventory_is_a_claim_about_what_i_thought_to_grep
    const callRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*resolveGoogleGrantOutcome\s*\(/;
    const callMatch = src.match(callRe);
    const callIdx = callMatch ? callMatch.index : -1;
    if (callIdx < 0) {
      fail.push("portal/portal.js — resolveGoogleGrantOutcome() is never CALLED with the success flag. "
        + "The decision exists and nothing asks for it.");
    } else {
      // 🔑 SCOPE BY THE NEXT TOP-LEVEL DECLARATION, not by a character count and not by brace-matching
      // backwards through 7,000 lines (braces inside template literals and regexes make that
      // unreliable this deep in the file — it returned nothing here). "The rest of this function" is a
      // real boundary. → feedback_a_gate_window_measured_in_characters_will_lie
      const after = src.slice(callIdx);
      const nextTop = after.search(/\n(?:async function |function |const [A-Za-z_$][\w$]* = (?:async )?\()/);
      const rest = nextTop > 0 ? after.slice(0, nextTop) : after;
      // The variable the resolver's result lands in must be what portalAlert is given — not merely
      // that a portalAlert appears somewhere nearby.
      const recv = callMatch;
      if (!new RegExp(`portalAlert\\s*\\(\\s*${recv[1]}\\b`).test(rest)) {
        fail.push(`portal/portal.js — \`${recv[1]}\` is never handed to portalAlert. The portal works out `
          + `that the grant was abandoned and then says nothing.`);
      } else pass.push("portal/portal.js — the resolver's result is handed to portalAlert");
    }
  }
}

// ── 6. THE CALLBACK STILL SENDS CLIENT GRANTS TO THE PORTAL ─────────────────────────────────────
// oauth-google-callback sends EVERY client grant to /portal/?google_connected=1 — including one
// started from the admin. Same origin, so the admin's marker is still set; unless the portal clears
// it, the next admin load inside the expiry window announces that a success was abandoned.
{
  const src = read("portal/portal.js");
  const cb = read("netlify/functions/oauth-google-callback.js");
  if (src && cb) {
    if (!/Location:\s*`\/portal\/\?google_connected=1/.test(cb)) {
      indet.push("oauth-google-callback no longer redirects client grants to /portal/?google_connected=1 — "
        + "check 5 assumes it does. Re-derive where an admin-started client grant lands.");
    } else pass.push("oauth-google-callback — client grants still land on /portal/?google_connected=1 (what check 4d assumes)");
  }
}

// ── REPORT ──────────────────────────────────────────────────────────────────────────────────────
for (const p of pass) console.log(`  ✅ ${p}`);
if (indet.length) { for (const i of indet) console.log(`  ⚠️  INDETERMINATE — ${i}`); }
if (fail.length) { for (const f of fail) console.log(`  🔴 ${f}`); }

if (fail.length) {
  console.log(`\n🔴 FAIL — ${fail.length} way(s) an abandoned Google grant can go unreported.`);
  process.exit(1);
}
if (indet.length) {
  console.log(`\n⚠️  INDETERMINATE — ${indet.length} thing(s) this gate could not read. Not a pass.`);
  process.exit(2);
}
console.log(`\n✅ every Google consent navigation stamps its attempt, and both surfaces report an abandoned grant (${pass.length} checks).`);

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — 2026-09-27. Each mutation was applied to a clean tree (and VERIFIED to have
 * actually changed the file — two early "passes" were mutations whose target string did not exist),
 * the gate run, the tree reverted. 15/15 caught with exit 1; clean tree exits 0.
 *
 *   M1  admin per-client connect: stamp removed .................. ✅ caught
 *   M2  free/busy grant button: stamp removed .................... ✅ caught
 *   M3  portal connect: stamp removed ............................ ✅ caught
 *   M4  admin RGA connect: stamp removed ......................... ✅ caught
 *   M5  portal: `ageMin <= 30` expiry bound dropped .............. ✅ caught
 *   M6  portal: notice title no longer names the outcome ......... ✅ caught
 *   M7  portal: abandoned branch returns null unconditionally .... ✅ caught
 *   M8  portal: marker not cleared on return ..................... ✅ caught
 *   M9  portal: admin's marker not cleared on success ............ ✅ caught
 *   M10 portal: resolver result never passed to portalAlert ...... ✅ caught
 *   M11 portal: notice fires on a SUCCESSFUL return too .......... ✅ caught
 *   M12 admin: abandoned branch neutered (`else if (false)`) ..... ✅ caught
 *   M13 admin: noscope downgraded from error to success .......... ✅ caught
 *   M14 admin: boot-notice IIFE renamed (never drained) ......... ✅ caught
 *   M15 admin: stale marker announced as a fresh failure ........ ✅ caught
 *
 * 🔑 THREE ESCAPES DURING DEVELOPMENT, all from the same cause and all fixed by RUNNING the code
 * instead of scanning it:
 *   · "the block contains a removeItem" passed with the abandoned branch deleted — the EXPIRY branch
 *     also clears. So the portal's decision was extracted into resolveGoogleGrantOutcome() and is now
 *     executed in a vm against a fake clock and storage.
 *   · "Date.now() appears and some `>` appears" passed with the whole `ageMin > 30` clause removed —
 *     a bundle this size satisfies that by accident. Now the gate finds the identifier holding the age
 *     and requires THAT identifier in a relational test.
 *   · check 5 anchored on `indexOf("resolveGoogleGrantOutcome(justLinkedGoogle)")`, which lands on the
 *     function's own SIGNATURE, so it measured the definition and failed a correct tree. Anchored on
 *     the assignment instead. That was the seventh time a check here anchored on a name's first hit.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */
