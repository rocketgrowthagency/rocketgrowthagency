#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-no-emoji-in-stored-data.mjs
//
// 🔒 WHY (2026-10-09): a hard rule since the start — "no emoji in data fields" — had no gate. notify-rga stored its Slack
// labels ("📷 Photos Uploaded", "✉️ Welcome Email Sent" …) into client_activity, and all 37 rga_alert rows carried emoji.
// Found while auditing the photo upload; the rows were cleaned and the writer fixed.
// Also: the portal inserted client_activity rows ("photos_uploaded", "customer_list_submitted") that RLS refuses for a
// client — not ONE has ever landed, and nothing read the result. Dead writes are a promise nobody keeps.
// HOLDS:
//   1. notify-rga stores a plain-text label (the emoji stays in the Slack message only)
//   2. the portal never inserts into client_activity (notify-rga writes the durable row with the service key)
//   3. live: no stored rga_alert label carries an emoji (exit 2 without database credentials — never a pass)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const strip = (s) => s.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const notify = strip(read("netlify/functions/notify-rga.js")), portal = strip(read("portal/portal.js"));
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}️]/u;
const F = []; const fail = (m) => F.push(m);
if (!/payload: \{ label: plainLabel, kind, message\b/.test(notify) || !/const plainLabel = String\(label\)\.replace\(/.test(notify)) fail("notify-rga stores its emoji label in client_activity again");
if (/from\("client_activity"\)\.insert\(/.test(portal)) fail("the portal inserts into client_activity — RLS refuses a client, so the row never lands");
let live = "not checked";
const U = process.env.SUPABASE_URL, K = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (U && K && process.env.APPROVAL_ARCHIVE_SITE_DIR === undefined) {
  try {
    const rows = await (await fetch(`${U}/rest/v1/client_activity?kind=eq.rga_alert&select=id,payload&order=occurred_at.desc&limit=500`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })).json();
    const bad = (Array.isArray(rows) ? rows : []).filter((r) => EMOJI.test(String(r.payload?.label || "")));
    live = `${rows.length} recent alert rows, ${bad.length} with emoji`;
    if (bad.length) fail(`${bad.length} stored alert label(s) carry an emoji`);
  } catch (e) { console.error(`⚠️  INDETERMINATE — the live rows could not be read: ${e.message}`); process.exit(2); }
}
if (F.length) { console.error("🔴 emoji or dead writes in stored data:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log(`✅ no emoji in stored data; the portal writes no row the database refuses (live: ${live})`);
