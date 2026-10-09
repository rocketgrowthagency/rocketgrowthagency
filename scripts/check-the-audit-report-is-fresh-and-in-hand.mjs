#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// check-the-audit-report-is-fresh-and-in-hand.mjs
//
// 🔒 WHY (2026-10-09, approved kickoff_call_script_v1 section 4): on the first real test call "Their audit report"
// opened an EXPIRED 30-day lead link, the expired page sent them to the website form to re-enter everything,
// and RGA's click fired a "lead re-engaged — high intent" alert. Chris: "this will need to be generated prior to
// the meeting and have provided to them" · "use their info that is stored … without having to reneter it all".
// HOLDS:
//   1. a client's report is built at booking (send-kickoff-invite), never expires (exp null), and is recorded
//      as a client_audit_snapshot; the invite carries the link that never changes (/report/…)
//   2. 💸 every trigger is bounded: booking only if none/over 14 days, by hand once a day, a lead once per
//      30 days per audit — and never while a build runs
//   3. the expired page refreshes from the old report (no form, no DELETE of the row it needs), and an RGA
//      view (rga=1) never fires the re-engaged alert
//   4. the portal and the console show it: reportLink on the kickoff card, copy-for-Meet-chat + Build button
// exit 0 = holds · 1 = broken · 2 = can't tell
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";

const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8").replace(/^\s*\/\/.*$/gm, ""); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const inv = read("netlify/functions/send-kickoff-invite.js"), bg = read("netlify/functions/report-build-background.js"),
  view = read("netlify/functions/fga-report-view.js"), refresh = read("netlify/functions/fga-report-refresh.js"),
  car = read("netlify/functions/client-audit-refresh.js"), helper = read("netlify/functions/_report-refresh.js"),
  avail = read("netlify/functions/kickoff-availability.js"), admin = read("admin/admin.js"), portal = read("portal/portal.js"), toml = read("netlify.toml");
const F = []; const fail = (m) => F.push(m);

// 1
if (!/\$\{clientShareLink\(clientId\)\}/.test(inv)) fail.push("the kickoff invite no longer carries their report link");
if (!/startBuild\(\{ record: recordFromClient\(full\), clientId, exp: null \}\)/.test(inv)) fail.push("booking no longer builds their report");
if (!/const exp = clientId \? null :/.test(bg)) fail.push("a client's report can expire again");
if (!/"\/client_audit_snapshots", \{ method: "POST"/.test(bg)) fail.push("a built client report is not recorded on the client");
if (!/from = "\/report\/:token"/.test(toml)) fail.push("the /report/ link that never changes has no route");
// 2
if (!/Date\.now\(\) - Date\.parse\(last\.builtAt\) > 14 \* 86400000\) && !\(await clientBuildRunning\(clientId\)\)/.test(inv)) fail.push("💸 booking builds a report without the 14-day / running guard");
if (!/Date\.now\(\) - Date\.parse\(last\.builtAt\) < DAY\) return jsonRes\(409/.test(car) || !/if \(running\) return jsonRes\(409/.test(car)) fail.push("💸 the admin rebuild is not limited to once a day / one at a time");
if (!/created_at=gte\.\$\{encodeURIComponent\(since\)\}/.test(refresh) || !/30 \* DAY/.test(refresh)) fail.push("💸 a lead can rebuild more than once per 30 days");
if (!/await supa\("\/fga_report_cache", \{\s*method: "POST"/.test(helper) || helper.indexOf('"/fga_report_cache"') > helper.indexOf("report-build-background")) fail.push("💸 the build starts before its placeholder is recorded — a double click could start two");
// 3
if (/method: "DELETE"/.test(view)) fail.push("an expired report row is deleted — the refresh then has nothing to rebuild from");
if (!/fga-report-refresh\?id=/.test(view) || !/fga-report-refresh\?t=/.test(view)) fail.push("the expired page no longer offers Refresh my report");
if ((view.match(/if \(!fromRga\) logReEngagement/g) || []).length < 2)   /* both the ?id and the ?t path */ fail.push("RGA opening a report fires the lead re-engaged alert again");
if (!/"\?"\) \? "&" : "\?"\) \+ "rga=1"/.test(admin)) fail.push("the console opens the report without rga=1");
// 4
if (!/reportLink: await/.test(avail) || !/Open your audit report<\/a>/.test(portal)) fail.push("the client's kickoff card lost its report link");
if (!/data-kc-copy-report/.test(admin) || !/data-kc-report-build=/.test(admin)) fail.push("the console lost Copy-for-Meet-chat or Build their report");

if (F.length) { console.error("🔴 the audit report is not fresh and in their hands:"); for (const f of F) console.error("   · " + f); process.exit(1); }
console.log("✅ the audit report: built at booking, never expires for a client, in the invite + portal + Meet chat, bounded, refreshable");
