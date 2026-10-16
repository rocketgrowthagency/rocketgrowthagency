#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-a-photo-never-goes-up-twice.mjs
//
// 🔒 WHY (2026-10-09, approved admin_photo_review_v2): RGA's own test had ONE file in slots 7 AND 8, and step 39
// offered "Send both to Google" — including the copy the AI had flagged. Google would have shown the photo twice.
// Step 39 is now one decision card per photo (their photo beside what the slot asks for, one verdict per problem,
// then the buttons), and a file's fingerprint (SHA-256 of its bytes) decides "the same photo".
// HOLDS — by RUNNING the real code, not reading it:
//   1. admin-photo-review refuses to approve a photo whose bytes are already on (or going to) Google, and the
//      second of two identical photos in one approval; a different photo in the same approval still goes
//   2. a photo whose file can't be read is never called a duplicate (no fingerprint → no claim)
//   3. the admin card: the second copy says "Same photo as slot N" and offers NO Send button; the copy that fits
//      offers Send (filled); the bulk button sends only the photos that fit — never "Send both"
//   4. a misfit offers Turn down first (filled) with "Send to Google anyway" beside it; the turn-down box opens
//      with the reason that fits already picked
//   5. a photo already on Google that is a second copy of a filled slot leads with "Not a slot photo"
// exit 0 = a photo can't go up twice · 1 = it can · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
// the step 7 renderer reads the shared second-logo rule (second_logo_cleanup_v1), imported by the portal itself
const SECOND_LOGO = await import((await import("node:url")).pathToFileURL(`${SITE}/shared/photo-second-logo.js`).href);
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = []; const fail = (m) => F.push(m);

// ── 1 + 2 · the real server guard ──
process.env.SUPABASE_URL = "https://supa.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
const BYTES = { "c/a.jpg": "OFFICE", "c/b.jpg": "OFFICE", "c/c.jpg": "TEAM", "c/d.jpg": "VAN", "c/e.jpg": "VAN", "c/x.jpg": null, "c/y.jpg": null };
let PHOTOS = [], patched = [], LISTING = "clean";
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("/storage/v1/object/client-photos/")) {
    const path = decodeURIComponent(u.split("/client-photos/")[1]);
    const b = BYTES[path];
    return b == null ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } : { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(b).buffer };
  }
  const rest = u.split("/rest/v1")[1] || "";
  const reply = (v) => ({ ok: true, status: 200, text: async () => JSON.stringify(v) });
  if (rest.startsWith("/client_onboarding_records")) return reply([{ data: { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: LISTING } } } } }]);
  if (rest.startsWith("/client_photo_publishes")) return reply([]);
  if (rest.startsWith("/client_photos") && init.method === "PATCH") {
    const ids = (rest.match(/id=in\.\(([^)]*)\)/) || [])[1]?.split(",").filter(Boolean) || [];
    const moved = PHOTOS.filter((p) => ids.includes(p.id) && p.publish_state === "in_review");
    patched.push(...moved.map((p) => p.id));
    return reply(moved);
  }
  if (rest.startsWith("/client_photos")) return reply(PHOTOS);
  return reply([]);
};
const req = createRequire(`${SITE}/netlify/functions/admin-photo-review.js`);
const src = read("netlify/functions/admin-photo-review.js");
const mod = { exports: {} };
const fakeRequire = (m) => m === "./_auth" ? { requireWorkspaceForClient: async () => ({ email: "rga@test" }) }
  : m === "./_photo-publish" ? { publishClientPhotos: async () => ({ published: 0 }), GOOGLE_CATEGORY: { interior: "INTERIOR", team: "TEAMS" } }
  : m === "./_deadline" ? {} : req(m);
new Function("require", "module", "exports", "process", src)(fakeRequire, mod, mod.exports, process);
const ID = (c) => `00000000-0000-0000-0000-00000000000${c}`;
async function approve(ids) {
  patched = [];
  const err = console.error; console.error = () => {};
  const r = await mod.exports.handler({ httpMethod: "POST", body: JSON.stringify({ client_id: "c1", action: "approve", photo_ids: ids.map(ID) }) });
  console.error = err;
  return { status: r.statusCode, body: JSON.parse(r.body), patched: patched.slice() };
}
PHOTOS = [
  { id: ID(1), storage_path: "c/a.jpg", shot_n: 8, publish_state: "published" },
  { id: ID(2), storage_path: "c/b.jpg", shot_n: 7, publish_state: "in_review" },
  { id: ID(3), storage_path: "c/c.jpg", shot_n: 12, publish_state: "in_review" },
  { id: ID(4), storage_path: "c/d.jpg", shot_n: 3, publish_state: "in_review" },
  { id: ID(5), storage_path: "c/e.jpg", shot_n: 4, publish_state: "in_review" },
  { id: ID(6), storage_path: "c/x.jpg", shot_n: 5, publish_state: "in_review" },
  { id: ID(7), storage_path: "c/y.jpg", shot_n: 6, publish_state: "in_review" },
];
{ const r = await approve([2, 3]);
  if (r.patched.includes(ID(2))) fail("a photo byte-for-byte already on Google was approved again");
  if (!r.patched.includes(ID(3))) fail("a different photo in the same approval was held back by the duplicate");
  if (!(r.body.duplicates || []).some((d) => d.id === ID(2) && d.same_slot === 8)) fail("the refusal doesn't say which slot already has it"); }
{ const r = await approve([2]);
  if (r.status !== 409 || r.patched.length) fail(`approving only a duplicate went through (HTTP ${r.status})`);
  if (!/Same photo as slot 8/.test(r.body.error || "")) fail(`the refusal doesn't say what's wrong: "${r.body.error}"`); }
// 🔒 one Google listing first: with a duplicate listing, approving sends nothing
{ LISTING = "duplicate"; const r = await approve([3]); LISTING = "clean";
  if (r.status !== 409 || r.patched.length || r.body.listing !== "duplicate") fail(`a photo was approved while the client has 2 Google listings (HTTP ${r.status})`); }
{ const r = await approve([4, 5]);
  if (!r.patched.includes(ID(4)) || r.patched.includes(ID(5))) fail("two identical photos in one approval both went up (or neither did)"); }
{ const r = await approve([6, 7]);
  if (!r.patched.includes(ID(6)) || !r.patched.includes(ID(7))) fail("a photo whose file couldn't be read was refused as a duplicate — no fingerprint is no claim"); }

// ── 3 + 4 + 5 · the real admin cards ──
const admin = read("admin/admin.js");
const cut = (a, b) => { const i = admin.indexOf(a), j = i < 0 ? -1 : admin.indexOf(b, i); return i < 0 || j < 0 ? null : admin.slice(i, j); };
const partA = cut("const PHOTO_KIND_LABEL = {", "let photoAiAsked");
const partB = cut("// 🔒 THE SAME FILE IN TWO SLOTS", "\n// 🔴 PHOTOS ARRIVE WHENEVER");
const clickSrc = cut('  } else if (t.hasAttribute("data-photo-td-open")) {', '  } else if (t.hasAttribute("data-photo-td-edit")) {');
if (!partA || !partB || !clickSrc) { console.error("⚠️  INDETERMINATE — could not lift the step 39 renderer"); process.exit(2); }
if (!/data-photo-td-pick/.test(clickSrc) || !/prTurnDownPick\(box, pick/.test(clickSrc)) fail("Turn down no longer opens with the reason that fits already picked");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const H = (s) => crypto.createHash("sha256").update(s).digest("hex");
const items = Array.from({ length: 20 }, (_, i) => ({ n: i + 1, group: "g", google: i === 0 ? "PROFILE" : "INTERIOR", do: i === 6 ? "The meeting room, set for a client." : i === 7 ? "A wide shot of the workspace." : `Shot ${i + 1}` }));
const ctx = {
  secondLogos: SECOND_LOGO.secondLogos, FILED_AS: SECOND_LOGO.FILED_AS, escapeHtml: esc, escapeAttribute: esc, PHOTO_REVIEW_STEP: "m1.gbp.photos", PHOTO_EXAMPLE_SPRITE: "", ADMIN_PHOTO_STATE: {},
  photoExampleOf: () => ({ art: "x" }), photoExampleArt: () => "<svg></svg>", artKey: (s, it) => `E|g|${it.n}`, formatDateTime: () => "Oct 9", obNumberOf: () => 11,
  state: { selectedClient: { id: "c1" }, photos: [
    { id: "p1", client_id: "c1", shot_n: 1, category: "logo", publish_state: "published", storage_path: "c/l.png" },
    { id: "p7", client_id: "c1", shot_n: 7, category: "interior", publish_state: "in_review", storage_path: "c/b.jpg", created_at: "2026-10-09T18:24" },
    { id: "p8", client_id: "c1", shot_n: 8, category: "interior", publish_state: "in_review", storage_path: "c/a.jpg", created_at: "2026-10-09T18:22" },
    { id: "p9", client_id: "c1", shot_n: 9, category: "interior", publish_state: "in_review", storage_path: "c/n.jpg", created_at: "2026-10-09T18:30" },
  ], onboardingData: { tasks: { "m1.audit.gbp_duplicate": { outcome_data: { verdict: "clean" } }, "m1.gbp.photos": { draft_shape: { items }, photo_matches: {},
    detected: { items: [{ name: "m/logo2", category: "EXTERIOR", thumb: "t" }, { name: "m/office2", category: "ADDITIONAL", thumb: "t" }] },
    photo_ai: { hashes: { p1: H("LOGO"), p7: H("OFFICE"), p8: H("OFFICE") },
      uploads: { p7: { matches: false, what: "an office lounge" }, p8: { matches: true, what: "an open office" }, p9: { matches: false, what: "a car" } },
      google: { "m/logo2": { name: "Your logo", what: "a logo", slot: 1 }, "m/office2": { name: "Your office", what: "an open office", slot: 8 } } } } } } },
};
vm.createContext(ctx);
try { vm.runInContext(`${partA}\n${partB}\nthis.render = photoReviewHtml;`, ctx); } catch (e) { console.error(`⚠️  INDETERMINATE — the renderer did not load: ${e.message}`); process.exit(2); }
const html = ctx.render();
const card = (id) => { const i = html.indexOf(`data-photo-row="${id}"`); const j = html.indexOf('class="pr-card', i + 10); return i < 0 ? "" : html.slice(i, j < 0 ? undefined : j); };
const c7 = card("p7"), c8 = card("p8"), c9 = card("p9");
if (!c7 || !c8 || !c9) fail("step 39 no longer draws one card per photo");
if (!/pr-verdict bad[^]*Same photo as slot 8/.test(c7)) fail("the second copy doesn't say it's the same photo as slot 8");
if (/data-photo-approve=/.test(c7)) fail("the second copy is still offered to Google");
if (/pr-verdict bad/.test(c8)) fail("the copy that fits was called the duplicate — the wrong one is kept");
if (!/class="admin-button" data-photo-approve="p8">Send to Google</.test(c8)) fail("the photo that fits doesn't lead with a filled Send to Google");
if (!/class="admin-button" data-photo-td-open="p9" data-photo-td-pick="Wrong shot for this slot">Turn down</.test(c9)) fail("a misfit doesn't lead with Turn down (wrong shot picked)");
if (!/class="admin-button admin-button-secondary" data-photo-approve="p9">Send to Google anyway</.test(c9)) fail("a misfit lost its Send to Google anyway");
if (/pr-verdict bad/.test(c9)) fail("a photo with no fingerprint was called a duplicate");
if (!/data-photo-approve-all="p8">Send the 1 that fits</.test(html)) fail("the bulk button doesn't send only the photo that fits");
if (/Send both|Send all \d/.test(html)) fail("a bulk send of every photo is back");
if (!/What slot 7 asks for/.test(c7) || !/The meeting room, set for a client\./.test(c7)) fail("a card no longer shows what its slot asks for beside the photo");
// 🔄 second_logo_cleanup_v1: a second copy of the LOGO is the client's call (their portal card), listed as "with the client";
// any other second copy on Google is still RGA's to sort and leads with Not a slot photo
const ex = html.slice(html.indexOf('data-pm-row="m/office2"'));
if (html.indexOf('data-pm-row="m/office2"') < 0 || !/second copy of slot 8/.test(ex) || !(ex.indexOf('data-pm-none="m/office2"') < ex.indexOf("data-pm-slot="))) fail("a second copy already on Google doesn't lead with Not a slot photo");
if (/data-pm-row="m\/logo2"/.test(html) || !/data-second-logo-row="m\/logo2"[^]*?With the client/.test(html)) fail("a second copy of the logo is still RGA's to sort (it's the client's call: with the client)");
if (/class="pr-band/.test(html)) fail("the stacked amber bands are back");
// 🔒 the turn-down panel (admin_photo_turn_down_v1): inside the card's info column, one reason picker, the client's preview
const info7 = c7.slice(c7.indexOf('class="pr-info"'));
// depth by counting divs: the panel must sit INSIDE the card's info column (the slice starts inside the card tag: pr-info + the panel's own div = 2)
const tdAt = c7.indexOf('data-photo-td="p7"'), before = c7.slice(0, tdAt);
const depth = (before.match(/<div\b/g) || []).length - (before.match(/<\/div>/g) || []).length;
const infoOpen = before.lastIndexOf('class="pr-info"') > before.lastIndexOf('class="pr-card"');
if (tdAt < 0 || depth !== 2 || !infoOpen) fail(`the turn-down panel no longer opens inside the card's info column (depth ${depth})`);
if (!/<select[^>]*data-photo-td-reason="p7"/.test(info7) || /pr-chip/.test(html)) fail("the turn-down is back to reason chips, not one picker");
if (!/The client will see[\s\S]*Please retake[\s\S]*From RGA:/.test(info7)) fail("the turn-down no longer previews what the client sees on their slot");
// 🔴 2026-10-12: a photo Google refused was announced as "going up on the hourly sync"
const rp = cut("async function reviewPhotos(", "\ndocument.addEventListener");
if (!rp || !/failedNow \+= /.test(rp) || !/moved - published - failedNow/.test(rp) || !/refused by Google/.test(rp)) fail("the approve banner can call a photo Google refused 'going up on the hourly sync'");
const pub = read("netlify/functions/_photo-publish.js");
if (!/ge\.details/.test(pub)) fail("a Google refusal is stored without Google's reason (error.details)");

if (F.length) { console.error("🔴 a photo can go up twice, or step 39 says the wrong thing:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the same photo never goes up twice (server refuses by fingerprint), and step 39's cards show the duplicate, the misfit and the fit with the right lead button");
