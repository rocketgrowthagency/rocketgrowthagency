#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — THE ADMIN MUST NEVER SHOW A RESCHEDULE AS IF IT WERE A FIRST BOOKING
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-09-27: *"after the client side change the time then admin is not updating… we need to
 * now sync with admin side after the client change time update after meeting was already confirmed
 * first."*
 *
 * The ledger was never wrong. `portal-book-kickoff` wrote the request, `send-kickoff-invite` already
 * PATCHed the existing Google event on `force` and already released the old hold. What was missing
 * was everything the admin was TOLD: the confirmed branch only rendered when there were NO open
 * requests, so the moment a client asked to move a booked call the "Invite sent — Monday" block
 * vanished and the card read exactly like a first-ever booking — under copy promising to
 * "create the event", which on that path is false. It moves one, and Google sends a reschedule notice.
 *
 * 🔑 WHY THIS GATE RUNS THE RENDERER. The defect is WHICH BRANCH draws, and a text scan cannot tell
 * branches apart — that is the lesson the OAuth gate paid for on the same day. So the two pure
 * decision functions are executed against real shapes, and the card's own template is rendered with
 * a fake `j` and asserted on its OUTPUT.
 * → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
 *
 * WHAT IS PINNED (properties, not spellings):
 *   1. A request with a DIFFERENT booked call present is recognised as a move; the same instant
 *      spelled two ways (`…T10:00:00-07:00` vs `…T17:00:00+00:00`) is NOT a move.
 *   2. A first booking (no booked row) is NOT a move — the old card must survive untouched.
 *   3. The client's hour is rendered from their stamped zone, and produces NOTHING when unknown.
 *   4. The move card names BOTH times, and its buttons carry `data-moves-from`.
 *   5. The move card must not claim it "creates the event".
 *   6. `releaseSlotHold` reports a release that matched no row — otherwise a slot is blocked forever
 *      and nothing anywhere says so.
 *
 * Exit 0 pass · 1 fail · 2 indeterminate. Mutation log at the bottom.
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
const fail = [], indet = [], pass = [];

function read(rel) {
  const p = path.join(WEB, rel);
  if (!fs.existsSync(p)) { indet.push(`${rel} does not exist`); return null; }
  const src = fs.readFileSync(p, "utf8");
  if (src.length < 5000) { indet.push(`${rel} is only ${src.length} bytes — not the bundle`); return null; }
  return src;
}

// Brace-match a named function out of the bundle so it can be executed in isolation.
function extract(src, signature) {
  const at = src.indexOf(signature);
  if (at < 0) return null;
  const open = src.indexOf("{", at);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") d++;
    else if (src[i] === "}") { d--; if (d === 0) return src.slice(at, i + 1); }
  }
  return null;
}

// Blank out comment bodies so a comment that QUOTES a string is not mistaken for a producer of it.
// 🔑 Length-preserving: offsets stay valid, so reported line numbers still point at real code.
// A `//` preceded by `:` is left alone — that is a URL, not a comment.
function blankComments(src) {
  const out = src.split("");
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "/" && src[i - 1] !== ":") {
      while (i < src.length && src[i] !== "\n") { out[i] = " "; i++; }
    } else if (src[i] === "/" && src[i + 1] === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] !== "\n") out[i] = " "; i++; }
      out[i] = " "; out[i + 1] = " "; i += 2;
    } else i++;
  }
  return out.join("");
}

const admin = read("admin/admin.js");

// ── 1 + 2. IS IT A MOVE? ────────────────────────────────────────────────────────────────────────
if (admin) {
  const fn = extract(admin, "function kickoffBookingBeingMoved(");
  if (!fn) {
    fail.push("admin/admin.js — kickoffBookingBeingMoved() is gone. Nothing decides whether a request "
      + "moves an existing call, so every reschedule renders as a first booking again.");
  } else {
    try {
      const ctx = { Date, Number, result: null };
      vm.createContext(ctx);
      vm.runInContext(fn + `
        const REQ = "2026-09-28T20:00:00.000Z";
        result = {
          move:  !!kickoffBookingBeingMoved({ booked: [{ slot_start: "2026-09-28T17:00:00+00:00" }] }, REQ),
          first: !!kickoffBookingBeingMoved({ booked: [] }, REQ),
          none:  !!kickoffBookingBeingMoved({}, REQ),
          // 🔑 THE SAME INSTANT, SPELLED TWO WAYS. The invite stamp writes an offset, the ledger
          // writes Z. A string compare would call a call a move of itself.
          sameInstantOffset: !!kickoffBookingBeingMoved({ booked: [{ slot_start: "2026-09-28T13:00:00-07:00" }] }, REQ),
          junk:  !!kickoffBookingBeingMoved({ booked: [{ slot_start: "not a date" }] }, REQ),
        };`, ctx, { timeout: 2000 });
      const r = ctx.result;
      if (!r.move) fail.push("admin/admin.js — a request at a different time from a BOOKED call is not recognised as a move.");
      else pass.push("admin/admin.js — a different booked time is recognised as a move");
      if (r.first || r.none) fail.push("admin/admin.js — a FIRST booking is being treated as a move; the original card would be replaced wrongly.");
      else pass.push("admin/admin.js — a first booking is not a move");
      if (r.sameInstantOffset) fail.push("admin/admin.js — the SAME instant written with an offset is treated as a different time, so a call would be reported as a move of itself. Compare by instant, not by string.");
      else pass.push("admin/admin.js — the same instant spelled two ways is not a move");
      if (r.junk) fail.push("admin/admin.js — an unparseable slot_start counts as a move.");
      else pass.push("admin/admin.js — an unparseable time is not a move");
    } catch (e) { indet.push(`admin/admin.js: kickoffBookingBeingMoved would not run in isolation (${e.message})`); }
  }
}

// ── 3. THE CLIENT'S HOUR, OR NOTHING ────────────────────────────────────────────────────────────
if (admin) {
  const fn = extract(admin, "function kickoffTheirHour(");
  if (!fn) {
    fail.push("admin/admin.js — kickoffTheirHour() is gone. The admin renders in the OPERATOR's zone "
      + "and the portal in the client's; without this the same '1:00 PM' names two different meetings.");
  } else {
    try {
      // 🔴 THE GATE MUST NOT DEPEND ON THE MACHINE RUNNING IT. kickoffTheirHour deliberately returns
      // "" when the client's zone equals the reader's — there is no second line to draw. So a test
      // hard-coded to America/Los_Angeles passes on an Eastern laptop and fails on a Pacific one,
      // which is exactly what happened the first time this was run.
      // → feedback_a_gate_that_cannot_fail
      const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const OTHER = here === "America/Los_Angeles"
        ? { zone: "America/New_York", hour: /4:00\s*PM/i, label: "4:00 PM" }
        : { zone: "America/Los_Angeles", hour: /1:00\s*PM/i, label: "1:00 PM" };
      const ctx = { Date, Intl, OTHER, here, result: null };
      vm.createContext(ctx);
      vm.runInContext(fn + `
        result = {
          theirs:  kickoffTheirHour("2026-09-28T20:00:00.000Z", OTHER.zone),
          sameAsMine: kickoffTheirHour("2026-09-28T20:00:00.000Z", here),
          noZone:  kickoffTheirHour("2026-09-28T20:00:00.000Z", null),
          badZone: kickoffTheirHour("2026-09-28T20:00:00.000Z", "Mars/Olympus"),
        };`, ctx, { timeout: 2000 });
      const r = ctx.result;
      if (!OTHER.hour.test(String(r.theirs || ""))) {
        fail.push(`admin/admin.js — a 20:00Z slot does not render as ${OTHER.label} in ${OTHER.zone}; it gave "${r.theirs}".`);
      } else pass.push(`admin/admin.js — renders the client's own hour (${OTHER.zone} → ${OTHER.label})`);
      // 🔑 And says nothing when there is nothing to say: a client in the reader's own zone needs no
      // second line, and printing one would imply a difference that does not exist.
      if (r.sameAsMine) fail.push(`admin/admin.js — a client in the READER's own zone still gets a "their time" line ("${r.sameAsMine}"), implying a difference that is not there.`);
      else pass.push("admin/admin.js — a client in the reader's own zone gets no second line");
      // 🔴 An unknown zone must produce NO line, never a guess in the operator's zone labelled as theirs.
      if (r.noZone) fail.push(`admin/admin.js — with NO client zone it still printed "${r.noZone}" — a time in the operator's zone labelled as the client's.`);
      else pass.push("admin/admin.js — an unknown zone prints nothing");
      if (r.badZone) fail.push(`admin/admin.js — an invalid zone printed "${r.badZone}" instead of nothing.`);
      else pass.push("admin/admin.js — an unusable zone prints nothing");
    } catch (e) { indet.push(`admin/admin.js: kickoffTheirHour would not run in isolation (${e.message})`); }
  }
}

// ── 4 + 5. THE CARD ITSELF ──────────────────────────────────────────────────────────────────────
// Rendered, not grepped: the assertions are about what reaches the operator's screen.
if (admin) {
  const marker = 'const from = kickoffBookingBeingMoved(j, q.slot_start);';
  if (!admin.includes(marker)) {
    fail.push("admin/admin.js — the request card no longer asks whether this is a move, so a reschedule "
      + "renders under first-booking copy again.");
  } else {
    // 🔑 EXTRACT THE ARROW ITSELF and call it. An earlier attempt sliced from `reqs.map((q) => {`,
    // which yields `reqs.map((q) => {…}` — not a callable expression, and the vm threw
    // "missing ) after argument list". Take the arrow, brace-matched, and evaluate it alone.
    const arrowAt = admin.indexOf("(q) => {", admin.indexOf("host.innerHTML = reqs.map("));
    const arrow = arrowAt < 0 ? null : extract(admin.slice(arrowAt), "(q) => {");
    if (!arrow) indet.push("admin/admin.js: could not brace-match the request-card arrow function");
    else {
      try {
        const stubs = {
          Date, Intl, Number, String,
          escapeHtml: (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
          escapeAttribute: (x) => String(x == null ? "" : x).replace(/"/g, "&quot;"),
          _kickoffPendingMove: new Map(),
          clientId: "c1",
          blindWarning: "",
          // 🔴 A zone that is NOT the runner's, so the "their time" lines are actually drawn.
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone === "America/Los_Angeles" ? "America/New_York" : "America/Los_Angeles",
          out: null,
        };
        stubs.kickoffBookingBeingMoved = new Function("return (" + extract(admin, "function kickoffBookingBeingMoved(") + ")")();
        stubs.kickoffTheirHour = new Function("return (" + extract(admin, "function kickoffTheirHour(") + ")")();
        vm.createContext(stubs);
        vm.runInContext(`
          const render = (${arrow});
          const REQ = { slot_start: "2026-09-28T20:00:00+00:00" };
          let j = { booked: [{ slot_start: "2026-09-28T17:00:00+00:00" }] };
          const move = render(REQ);
          j = { booked: [] };
          const first = render(REQ);
          out = { move, first };
        `, stubs, { timeout: 4000 });
        const move = String(stubs.out.move || ""), first = String(stubs.out.first || "");
        const plain = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

        if (!/asked to move it/i.test(move)) fail.push("admin/admin.js — the reschedule card does not say they asked to MOVE it; it reads like a fresh request.");
        else pass.push("admin/admin.js — the move card leads with 'They asked to move it'");

        if (!/data-moves-from=/.test(move)) fail.push("admin/admin.js — the move card's buttons carry no data-moves-from, so the confirm dialog cannot describe a move.");
        else pass.push("admin/admin.js — the move card's buttons carry the time being left");

        // 🔴 BOTH times, or the operator has to go and look the other one up — which is where a
        // wrong answer on a live call comes from.
        const oldHour = new Date("2026-09-28T17:00:00+00:00").toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
        const newHour = new Date("2026-09-28T20:00:00+00:00").toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
        // 🔴 ASSERT ON THE FROM→TO ROW, NOT THE WHOLE CARD. Checking the card passed with the entire
        // `From` value deleted, because the old hour also appears in the "Keep 10:00 AM" button — so
        // the gate was reading a different element than the one the defect lives in.
        // → feedback_a_gate_must_pin_the_property_not_the_spelling
        const rowMatch = move.match(/<div class="pm-move">([\s\S]*?)<\/div>/);
        if (!rowMatch) {
          fail.push("admin/admin.js — the move card has no .pm-move From→To row at all.");
        } else if (!rowMatch[1].includes(oldHour) || !rowMatch[1].includes(newHour)) {
          fail.push(`admin/admin.js — the From→To row does not carry BOTH times (${oldHour} → ${newHour}). Row: ${plain(rowMatch[1]).slice(0, 160)}`);
        } else pass.push(`admin/admin.js — the From→To row names both times (${oldHour} → ${newHour})`);

        if (/creates the event/i.test(move)) fail.push("admin/admin.js — the move card still says confirming 'creates the event'. It PATCHes an existing one and Google sends a reschedule notice.");
        else pass.push("admin/admin.js — the move card does not claim to create an event");

        if (!/their time/i.test(move)) fail.push("admin/admin.js — the move card never names the client's own hour, so one '1:00 PM' can mean a different meeting on each screen.");
        else pass.push("admin/admin.js — the move card names the client's hour too");

        // ── The FIRST-booking card must be untouched ──────────────────────────────────────────
        if (/asked to move it/i.test(first)) fail.push("admin/admin.js — a FIRST booking now renders as a move.");
        else if (!/Confirm (&amp;|&) send invite/.test(first)) fail.push("admin/admin.js — the first-booking card lost its 'Confirm & send invite' button.");
        else if (/data-moves-from=/.test(first)) fail.push("admin/admin.js — a first booking carries data-moves-from, so its dialog would describe a move that is not happening.");
        else pass.push("admin/admin.js — a first booking still renders the original card");
      } catch (e) { indet.push(`admin/admin.js: the request card would not render in isolation (${e.message})`); }
    }
  }
}

// ── 6. THE ASK SENTENCE HAS EXACTLY ONE IMPLEMENTATION ──────────────────────────────────────────
// 🔴 THE CARD SHIPPED MOVE-AWARE AND TWO OTHER RENDERERS KEPT TELLING THE OLD STORY. Chris
// screenshotted the Onboarding tab reading "They picked Monday…" over a call already in the diary,
// minutes after the move-aware card went live — and a first version of this gate then found a THIRD
// producer I had not known existed. Each tab reaches a different subset of the three.
//
// 🔑 Trying to gate "is this producer's ternary move-aware?" failed twice: deleting the move arm of
// the BODY left the move arm of the TITLE in scope, so every structural check still saw move copy.
// The fix was not a cleverer regex — it was collapsing three copies of the sentence into
// `kickoffAskCopy`, which is a thing a gate can state plainly.
// → feedback_fix_the_class_not_the_instance · feedback_a_gate_must_pin_the_property_not_the_spelling
{
  const src = admin;
  if (src) {
    const fn = extract(src, "function kickoffAskCopy(");
    if (!fn) {
      fail.push("admin/admin.js — kickoffAskCopy() is gone. The ask sentence is hand-written again, and "
        + "whichever producer you do not think of will keep describing a reschedule as a first booking.");
    } else {
      // 🔴 RUN IT. Asking "does the move wording appear in this function?" passed when the move TITLE
      // was reverted (the move LINE still matched) and again when the move LINE was reverted (the
      // TITLE still matched). The helper is small and pure — call it both ways and compare.
      // → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
      try {
        const ctx = { result: null };
        vm.createContext(ctx);
        vm.runInContext(fn + `
          result = { move: kickoffAskCopy("SOMETIME", true), pick: kickoffAskCopy("SOMETIME", false) };`,
          ctx, { timeout: 2000 });
        const { move, pick } = ctx.result;
        if (!move || !pick) {
          fail.push("admin/admin.js — kickoffAskCopy did not return copy for both cases.");
        } else if (move.title === pick.title) {
          fail.push(`admin/admin.js — kickoffAskCopy gives a move and a first booking the SAME title ("${move.title}"). The operator cannot tell them apart.`);
        } else if (move.line === pick.line) {
          fail.push(`admin/admin.js — kickoffAskCopy gives a move and a first booking the SAME line ("${move.line}").`);
        } else if (/They picked/i.test(move.title + " " + move.line)) {
          fail.push(`admin/admin.js — the MOVE copy still says "They picked": "${move.line}"`);
        } else if (!/move|instead/i.test(move.title + " " + move.line)) {
          fail.push(`admin/admin.js — the move copy never mentions moving: "${move.title} — ${move.line}"`);
        } else pass.push("admin/admin.js — kickoffAskCopy returns a different title AND line for a move");
      } catch (e) {
        indet.push(`admin/admin.js: kickoffAskCopy would not run in isolation (${e.message})`);
      }

      // 🔴 AND NOTHING ELSE MAY SAY IT. This is the half that actually prevents the regression:
      // a new producer that hand-writes the sentence fails here by construction.
      const at = src.indexOf("function kickoffAskCopy(");
      const inHelper = (i) => i >= at && i < at + fn.length;
      const code = blankComments(src);   // comments may quote the sentence; they are not producers
      for (const [re, what] of [
        [/They picked \$\{[A-Za-z_$][\w$]*\}/g, "the ask sentence"],
        [/["'`]Confirm the kickoff time they asked for["'`]/g, "the ask title"],
      ]) {
        re.lastIndex = 0;
        let m, strays = 0;
        while ((m = re.exec(code))) { if (!inHelper(m.index)) { strays++;
          fail.push(`admin/admin.js:${code.slice(0, m.index).split("\n").length} — hand-writes ${what} outside `
            + `kickoffAskCopy. That producer cannot stay move-aware; route it through the helper.`); } }
        if (!strays) pass.push(`admin/admin.js — ${what} exists only inside kickoffAskCopy`);
      }

      // And the producers must actually CALL it — a helper nobody uses looks finished.
      const calls = (src.match(/kickoffAskCopy\s*\(/g) || []).length - 1;   // minus the declaration
      if (calls < 3) {
        fail.push(`admin/admin.js — kickoffAskCopy is called ${calls} time(s); all three producers `
          + `(cockpit alert, next-action, Overview patch) must route through it.`);
      } else pass.push(`admin/admin.js — all ${calls} producers route through kickoffAskCopy`);
    }
  }
}

// ── 7. A MOVE MUST NOT DISCARD THE CLIENT'S OWN TIMEZONE ────────────────────────────────────────
// 🔴 FOUND IN THE LIVE RECORD AFTER THE FIRST REAL MOVE, 2026-09-27. `client_tz` went from
// `America/Los_Angeles` to null, because `data.kickoff_invite` is REPLACED wholesale by an object
// that does not carry it — and only `portal-book-kickoff` ever writes it, at the moment the client
// picks. So the first invite named the hour the client actually read and the first reschedule fell
// back to deriving a zone from the state code in `primary_market`. Nine states straddle two zones.
// 🔑 Nothing on screen showed this. It was only visible by reading the row back.
// → project_client_timezone_rule · feedback_verify_the_write_not_just_the_intent
{
  const src = read("netlify/functions/send-kickoff-invite.js");
  if (src) {
    const at = src.indexOf("const record = {");
    if (at < 0) {
      indet.push("send-kickoff-invite.js: could not find the kickoff_invite record literal");
    } else {
      let d = 0, end = -1;
      for (let i = src.indexOf("{", at); i < src.length; i++) {
        if (src[i] === "{") d++;
        else if (src[i] === "}") { d--; if (d === 0) { end = i; break; } }
      }
      const lit = end > 0 ? src.slice(at, end + 1) : "";
      if (!/client_tz/.test(lit)) {
        fail.push("send-kickoff-invite.js — the kickoff_invite record does not carry client_tz forward, so "
          + "every reschedule DISCARDS the timezone the client actually read and later emails derive one "
          + "from their state code instead.");
      } else if (/\.\.\.prior[,\s}]/.test(lit)) {
        // A blanket spread would also restore requested_start/requested_at — the request this very
        // send just answered — and the card would keep showing a pending ask that no longer exists.
        fail.push("send-kickoff-invite.js — the record spreads the whole prior stamp, which restores "
          + "requested_start/requested_at for a request that was just answered. Carry client_tz explicitly.");
      } else pass.push("send-kickoff-invite.js — client_tz survives a move, and only client_tz");
    }
  }
}

// ── 8. A SLOT THAT WAS NOT RELEASED SAYS SO ─────────────────────────────────────────────────────
{
  // 🔑 BOTH functions that free a slot, not just the one that had the bug. A cancel that silently
  // fails to free the hour blocks it forever exactly as a reschedule would.
  for (const [file, sig] of [
    ["netlify/functions/send-kickoff-invite.js", "async function releaseSlotHold("],
    ["netlify/functions/cancel-kickoff-invite.js", null],
  ]) {
    if (!sig) {
      const c = read(file);
      if (c && !/SLOT NOT FREED/.test(c)) {
        fail.push(`${file} — frees the slot on cancel without reading the DELETE back. A 4xx, or a `
          + `DELETE matching no row, both look like success and leave that hour blocked forever.`);
      } else if (c) pass.push(`${file} — a cancel that frees nothing reports itself`);
      continue;
    }
  const src = read("netlify/functions/send-kickoff-invite.js");
  if (src) {
    const fn = extract(src, "async function releaseSlotHold(");
    if (!fn) fail.push("send-kickoff-invite.js — releaseSlotHold() is gone; a reschedule would leave the old hour blocked forever.");
    else if (!/console\.error/.test(fn)) {
      fail.push("send-kickoff-invite.js — releaseSlotHold cannot report a failure. If the DELETE no-ops, "
        + "the old hour stays blocked for every client and nothing anywhere records it.");
    } else {
      // 🔴 THE REPORT MUST BE IN THE EMPTY-RESULT BRANCH, not merely somewhere in the function.
      // A first version asked only "does a console.error exist?" and "is there a zero-length test?" —
      // and passed with the zero-length branch emptied out, which is the exact defect. Brace-match
      // the branch and look inside it. → feedback_a_gate_that_it_exists_is_not_a_gate_that_it_works
      // 🔑 `[^)]*` cannot cross the `)` in `Array.isArray(gone)`, so the real condition never matched
      // and a correct tree failed. Scan up to the opening brace instead, which is the actual boundary.
      const m = fn.match(/if\s*\([^{}]*?(?:\.length === 0|\.length < 1|!\w+\.length)[^{}]*?\)\s*\{/);
      if (!m) {
        fail.push("send-kickoff-invite.js — releaseSlotHold checks the status but never whether a row was "
          + "actually removed. A 200 that matched nothing is the failure mode that matters here.");
      } else {
        const from = fn.indexOf(m[0]) + m[0].length - 1;
        let d = 0, body = "";
        for (let i = from; i < fn.length; i++) {
          if (fn[i] === "{") d++;
          else if (fn[i] === "}") { d--; if (d === 0) { body = fn.slice(from, i + 1); break; } }
        }
        if (!/console\.error/.test(body)) {
          fail.push("send-kickoff-invite.js — releaseSlotHold notices that the DELETE freed nothing and "
            + "then says nothing. That is a slot blocked forever with no trace.");
        } else pass.push("send-kickoff-invite.js — a release that frees nothing reports itself");
      }
    }
  }
  }
}

for (const p of pass) console.log(`  ✅ ${p}`);
for (const i of indet) console.log(`  ⚠️  INDETERMINATE — ${i}`);
for (const f of fail) console.log(`  🔴 ${f}`);
if (fail.length) { console.log(`\n🔴 FAIL — ${fail.length} way(s) a reschedule can read as a first booking.`); process.exit(1); }
if (indet.length) { console.log(`\n⚠️  INDETERMINATE — ${indet.length} thing(s) this gate could not read. Not a pass.`); process.exit(2); }
console.log(`\n✅ a reschedule names both times, both zones and the right action (${pass.length} checks).`);

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * MUTATION LOG — 2026-09-27. Each applied to a clean tree, VERIFIED to have changed the file, gate
 * run, tree reverted. 13/13 caught with exit 1; clean tree exits 0.
 *
 *   M1  move detection compares strings, not instants .......... ✅
 *   M2  a first booking counts as a move ....................... ✅
 *   M3  unknown client zone guessed in the reader's zone ....... ✅
 *   M4  the same-zone guard removed ............................ ✅
 *   M5  the card stops asking whether this is a move ........... ✅
 *   M6  the From value deleted from the From→To row ............ ✅ (see below)
 *   M7  the move card keeps "creates the event" ................ ✅
 *   M8  buttons lose data-moves-from ........................... ✅
 *   M9  the "their time" labels dropped ........................ ✅
 *   M10 the empty-result branch of releaseSlotHold goes silent .. ✅ (see below)
 *   M11 releaseSlotHold stops checking the status entirely ..... ✅
 *   M12 the move pill reverts to "They asked for" .............. ✅
 *
 * 🔑 TWO ESCAPES, both the same mistake — ASSERTING ON A WIDER SCOPE THAN THE DEFECT:
 *   · M6 passed with the whole `From` value deleted, because the old hour ALSO appears in the
 *     "Keep 10:00 AM" button. The check now reads the `.pm-move` row itself.
 *   · M10 passed with the empty-result branch emptied, because a `console.error` still existed
 *     elsewhere in the function. The check now brace-matches that branch and looks inside it.
 *
 * 🔴 And the gate failed a CORRECT tree twice while being written:
 *   · The zone test hard-coded America/Los_Angeles. `kickoffTheirHour` deliberately returns "" when
 *     the client's zone equals the reader's — and this machine IS Pacific, so the assertion was
 *     testing the guard, not the formatting. It now picks a zone that differs from the runner's.
 *   · `/if\s*\([^)]*…\)/` cannot cross the `)` inside `Array.isArray(gone)`, so the real condition
 *     never matched. Scanning to the opening brace is the actual boundary.
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */
