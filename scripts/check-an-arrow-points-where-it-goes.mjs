#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * GATE — AN ARROW POINTS THE WAY THE CONTENT ACTUALLY MOVES
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Chris, 2026-10-02, on the output fold: *"on the open full the arrow makes it look like it will
 * open in a new tab. can you make the arrow a down arrow for all these."*
 *
 * `↗` is the stamp for LEAVING OUR ORIGIN — it is how a control promises a new tab. "Open full"
 * never left: it expands the preview in place, which admin.js's own comment above the handler
 * already said ("the fold is a preview of something already on the page, not a door to somewhere
 * else"). The glyph contradicted the code beside it.
 * → feedback_an_action_that_leaves_our_origin_must_stamp_itself
 *
 * 🔑 THE RULE, NOT THE THREE INSTANCES: every `↗` in emitted markup must sit on something that
 * genuinely leaves. Each one is REGISTERED below, so a new `↗` on an in-place control fails this
 * gate until someone says which it is. → feedback_fix_the_class_not_the_instance
 *
 * Exit 0 pass · 1 an arrow promises something the control does not do · 2 could not run.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT. A gate that can only ever read the real
// working tree cannot be pointed at a scratch copy, so its mutations cannot be run — and a
// gate nobody can make fail is a gate nobody has checked. Found 2026-10-06 when three
// mutations of `check-refusal-is-not-done` all came back green: it was reading straight past
// them. → feedback_a_gate_that_cannot_fail · feedback_the_harness_i_wrote_to_check_my_work_can_lie
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const W = `${__SITE}/`;
let src, html, portal;
try {
  src = fs.readFileSync(W + "admin/admin.js", "utf8");
  html = fs.readFileSync(W + "admin/index.html", "utf8");
  portal = fs.readFileSync(W + "portal/portal.js", "utf8");
} catch { console.error("⛔ cannot read the sources"); process.exit(2); }

const fail = [];

// ═══ PART 1 — THE EXPAND CONTROL POINTS DOWN, AND REVERSES ═══════════════════════════════════
if (/Open full ↗/.test(src)) fail.push('"Open full" is stamped ↗ again — it expands in place and never leaves');
const outFull = (src.match(/>Open full ↓<\/button>/g) || []).length;
if (outFull !== 2) fail.push(`expected 2 "Open full ↓" controls in the output fold, found ${outFull}`);
if (!/btn\.textContent = full \? "Show less ↑" : "Open full ↓";/.test(src)) {
  fail.push("the expand toggle no longer points down when collapsed and up when open");
}
// 🔴 The ternary it replaced had two IDENTICAL branches — a choice that could not choose.
if (/\? "Open full [^"]*" : "Open full [^"]*"/.test(src)) fail.push("the expand label is back to a ternary whose branches are the same");

// ═══ PART 2 — EVERY REMAINING ↗ IS ON SOMETHING THAT LEAVES ══════════════════════════════════
// 🔑 Registered by what the control IS. An unregistered ↗ fails rather than being assumed correct.
const LEAVES = [
  { needle: 'target="_blank" rel="noopener noreferrer">${escapeHtml(b)} ↗</a>', why: "the admin social profiles card (client_social_profiles_v1): opens the profile on its network, target=_blank" },
  { needle: 'target="_blank" rel="noopener noreferrer">${escapeHtml(yt.handle || yt.url)} ↗</a>', why: "the video step's channel line (client_social_profiles_v1): opens their channel, target=_blank" },
  { needle: 'target="_blank" rel="noopener noreferrer">Try the link ↗</a>', why: "admin step 36 done card (approved step36_done_card_v2): opens the booking link Google has, target=_blank" },
  { needle: 'href="https://business.google.com/" target="_blank" rel="noopener noreferrer">Do it in Google Business Profile instead ↗</a>', why: "admin steps 28 card B + 32 (approved 10-29): the by-hand way out to Google Business Profile, target=_blank" },
  { needle: 'href="https://business.google.com/" target="_blank" rel="noopener">Open Business Profile ↗</a>', why: "To do (todo_redesign_v1, 10-26): Google Business Profile, where RGA makes a by-hand change; target=_blank" },
  { needle: 'open.textContent = "Open ↗"', why: "a cs-linkopen anchor with target=_blank" },
  { needle: ">View as client ↗</a>", why: "an anchor to the client report" },
  // 🔄 2026-10-09 (kickoff_call_script_v1): "Join the call ↗" became "Join and start the call" (a button that opens
  // Meet itself) and, while live, the quiet ">Meet ↗</a>" link beside End the call.
  { needle: ">Meet ↗</a>", why: "the Meet link while the call is live, target=_blank" },  // 🔄 2026-10-09: the Overview card's "Join the call ↗" is gone — the call console owns joining (kickoff_every_surface_every_state_v1).
  { needle: ">Their website ↗</a>", why: "the client's site, target=_blank" },
  { needle: 'rel="noopener">Open the map ↗</a>', why: "the client's listing on Google Maps, target=_blank (gbp_protocols_v1, 11-1)" },
  { needle: '<a class="admin-button admin-button-secondary ob-acc-open" href=', why: "admin step 8 \"check their site\": opens the client's OWN website in a new tab (target=_blank) so RGA can see its builder (step3_blocked_sites_v1)" },
  // 10-28 (check-before-confirming found them): the website-change loop, step 8's access card and the To do verb, every one an anchor with target=_blank
  { needle: 'google_by_hand: "Open Business Profile ↗"', why: "the To do verb for a by-hand Google change: drawn only as the mvNaHtml / To do anchor to business.google.com, target=_blank" },
  { needle: '<a id="adminNextActionGbp" class="admin-button" href="https://business.google.com/" target="_blank"', why: "Your action's Open Business Profile, target=_blank" },
  { needle: 'target="_blank" rel="noopener">View on GitHub ↗</a>', why: "admin step 8 website change: the pull request on GitHub, target=_blank (merge_without_the_browser_v1)" },
  { needle: 'title="Click it in the access@ Chrome profile">Open ${escapeHtml(nm)} invite in access@ ↗</a>', why: "admin step 8: the builder's invite, opened in the access@ profile, target=_blank" },
  { needle: 'target="_blank" rel="noopener">Open on GitHub ↗</a>', why: "admin step 8: the repository's invitations on GitHub, target=_blank" },
  { needle: '<a href="https://github.com/${escapeAttribute(acc.repo)}" target="_blank" rel="noopener">${escapeHtml(acc.repo)} ↗</a>', why: "admin step 8: the client's repository on GitHub, target=_blank" },
  { needle: '<a href="https://github.com/${escapeAttribute(i.repo)}" target="_blank" rel="noopener">${escapeHtml(i.repo)} ↗</a>', why: "admin step 8 invite facts: the repository on GitHub, target=_blank" },
  { needle: 'href="https://vault.bitwarden.com" target="_blank" rel="noopener">Open Bitwarden ↗</a>', why: "admin step 9: the Bitwarden vault, target=_blank" },
  { needle: ">Search it ↗</a>", why: "admin row 26 monthly leak check: a Google search for the tracking number, target=_blank (call_tracking_upgrade_v1)" },
  // 🔄 2026-10-08: ">Join Meet ↗</a>" left with the old T-15 console (v2 uses "Join the call ↗").
  { needle: ">Their audit report ↗</a>", why: "the FGA report, target=_blank" },
  { needle: ">Open in Gmail ↗</a>", why: "the sent email in hello@'s Gmail, target=_blank" },
  { needle: 'rel="noopener">${escapeHtml(l.replace(', why: "a URL inside a sent email's body, target=_blank" },
  // the Your-action card: a button carrying `href` is wired to window.open (the `data.admin.href` branch)
  { needle: 'textContent = data.admin.btn || "Open ↗"', why: "Your action's href branch, window.open" },
  { needle: "${label} ↗</a>", why: "a linkified URL in stored output, target=_blank" },
  { needle: 'class="admin-button ob-gcard-go" href="https://business.google.com/" target="_blank"', why: "the Google card's Open Google Business Profile (admin_google_card_v1), target=_blank" },
  { needle: 'class="ob-gcard-maps"', why: "the Google card's See it on Google Maps (one_google_card_v1), target=_blank" },
  { needle: '<td class="ob-cr-pg"><a href="${escapeAttribute(pg.url)}" target="_blank" rel="noopener">', why: "a code step's result table (approved admin_code_result_v1, 11-8): each row's page name opens that page on their website, target=_blank" },
  { needle: "Open Google's owner page", why: "admin step 11: Google's own page for the second listing's owner, target=_blank" },
];
const isComment = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);
let checked = 0;
src.split("\n").forEach((l, i) => {
  if (!l.includes("↗") || isComment(l)) return;
  const hit = LEAVES.find((x) => l.includes(x.needle));
  if (!hit) {
    fail.push(`admin/admin.js:${i + 1} stamps ↗ and is not registered as leaving our origin: ${l.trim().slice(0, 72)}`);
    return;
  }
  checked++;
});
for (const x of LEAVES) {
  if (!src.includes(x.needle)) fail.push(`a registered leaving-control is gone (${x.why}) — update the registry rather than leaving it stale`);
}

// 🔴 And an anchor that carries ↗ must actually open elsewhere. The two inline anchors declare it
// on the same line; the DOM-built one sets it two lines above, so check its block.
for (const [needle, want] of [[">Join the call ↗</a>", 'target="_blank"'], [">Their website ↗</a>", 'target="_blank"'],
  [">Their audit report ↗</a>", 'target="_blank"'], [">Open in Gmail ↗</a>", 'target="_blank"'], ["${label} ↗</a>", 'target="_blank"']]) {
  const line = src.split("\n").find((l) => l.includes(needle));
  if (line && !line.includes(want)) fail.push(`${needle.replace(/[<>/]/g, "")} carries ↗ but no ${want} on its own line`);
}
const csBlock = src.slice(src.indexOf("const open = document.createElement"), src.indexOf('open.textContent = "Open ↗"') + 40);
if (!/open\.target = "_blank"/.test(csBlock)) fail.push('the "Open ↗" link no longer sets target=_blank');

// ═══ PART 3 — AND NOWHERE ELSE INVENTS ONE ═══════════════════════════════════════════════════
portal.split("\n").forEach((l, i) => {
  if (!l.includes("↗") || isComment(l)) return;
  if (!/target="_blank"|targ/.test(l)) fail.push(`portal/portal.js:${i + 1} stamps ↗ without opening elsewhere`);
});
html.split("\n").forEach((l, i) => {
  if (!l.includes("↗")) return;
  if (!/target="_blank"/.test(l)) fail.push(`admin/index.html:${i + 1} stamps ↗ without target=_blank`);
});

if (fail.length) {
  console.error("🔴 an arrow does not point the way the content moves:");
  for (const f of fail) console.error("   · " + f);
  process.exit(1);
}
console.log(`✅ ↗ only where the control leaves (${checked} registered) · the output fold expands with ↓ and collapses with ↑`);
