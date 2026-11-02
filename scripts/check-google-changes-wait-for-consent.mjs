#!/usr/bin/env node
// check-google-changes-wait-for-consent.mjs — nothing automated changes a client's Google profile until they've agreed, and calls aren't recorded (approved client_google_consent_v1 + contract_v2_redline §5B, §5D, 10-31).
// 🔴 WHY: Google's API policies require "prior specific and express consent", and "If you respond to reviews on behalf of your end-client, you must receive their authorization first." `v2-respond-review.js`
// checked nothing while the privacy page said "reviews you authorize". A dozen files write to Google, so the guard sits on fetch: a list of writers is out of date the day someone adds one.
// HOLDS, through the real guard with a stubbed network: every kind of write without consent is refused and never reaches Google; agreed lets it through; a later withdrawal stops it; an unreadable record refuses;
// reads never wait; every file that writes loads the guard; the connect and the reply check first; the portal shows the tick and the admin shows the record.
// Files only. Exit 0 = holds · 1 = broken · 2 = can't tell. → project_everything_queued
import fs from "node:fs";
import { createRequire } from "node:module";
const SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";
const FN = `${SITE}/netlify/functions`;
const read = (r) => { try { return fs.readFileSync(`${SITE}/${r}`, "utf8"); } catch { console.error(`⚠️  INDETERMINATE — cannot read ${r}`); process.exit(2); } };
const F = [], fail = (m) => F.push(m);
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
process.env.SUPABASE_URL = "https://db.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";

// the network: Supabase answers from `world`, Google is recorded
const world = { owners: [{ client_id: "c1" }], events: [], dbDown: false };
const reached = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url.startsWith("https://db.test/")) {
    if (world.dbDown) return new Response("down", { status: 500 });
    if (url.includes("/client_google_oauth")) return new Response(JSON.stringify(world.owners));
    return new Response(JSON.stringify(world.events));
  }
  reached.push(`${init.method || "GET"} ${url}`);
  return new Response("{}", { status: 200 });
};
const req = createRequire(`${FN}/x.js`);
req("./_deadline.js");
const g = req("./_google-consent.js");
if (globalThis.fetch.name !== "fetchWithConsentGuard") fail("_deadline.js doesn't install the guard, so nothing is guarded");

const WRITES = [
  ["PATCH", "https://mybusinessbusinessinformation.googleapis.com/v1/locations/123?updateMask=profile.description"],
  ["PUT", "https://mybusiness.googleapis.com/v4/accounts/1/locations/123/reviews/z/reply"],
  ["POST", "https://mybusiness.googleapis.com/v4/accounts/1/locations/123/localPosts"],
  ["POST", "https://mybusiness.googleapis.com/v4/accounts/1/locations/123/media"],
  ["DELETE", "https://mybusiness.googleapis.com/v4/accounts/1/locations/123/media/m"],
  ["PATCH", "https://mybusinessbusinessinformation.googleapis.com/v1/locations/123/attributes?attributeMask=x"],
];
const READS = [
  ["GET", "https://mybusiness.googleapis.com/v4/accounts/1/locations/123/reviews"],
  ["POST", "https://mybusinessbusinessinformation.googleapis.com/v1/googleLocations:search"],
  ["POST", "https://mybusinessverifications.googleapis.com/v1/locations/123:fetchVerificationOptions"],
];
async function tryAll(list) { reached.length = 0; const out = []; for (const [m, u] of list) out.push(await fetch(u, { method: m })); return out; }

world.events = [];
let res = await tryAll(WRITES);
if (reached.length) fail(`with no consent these reached Google: ${reached.join(" · ")}`);
if (res.some((r) => r.status !== 403)) fail("a refused write doesn't read as a refusal, so its caller would report success");
const said = await res[0].clone().json();
if (!/hasn't authorized/.test(said.error?.message || "")) fail("the refusal doesn't say why");
await tryAll(READS);
if (reached.length !== READS.length) fail("a read was held up by the consent check");

world.events = [{ kind: "google_consent_agreed", created_at: "2026-11-03T18:00:00Z", payload: { wording_version: "v1", by_email: "o@x.co" } }];
await tryAll(WRITES);
if (reached.length !== WRITES.length) fail(`an agreed client's writes were refused (${reached.length} of ${WRITES.length} went)`);

world.events = [{ kind: "google_consent_withdrawn", created_at: "2026-11-05T18:00:00Z", payload: {} }];
await tryAll(WRITES);
if (reached.length) fail("a withdrawn authorization still lets changes through");

world.events = [{ kind: "google_consent_agreed", created_at: "2026-11-03T18:00:00Z", payload: {} }];
world.owners = [];
await tryAll(WRITES);
if (reached.length) fail("a location nobody is connected to was written to");
world.owners = [{ client_id: "c1" }];
world.dbDown = true;
res = await tryAll(WRITES);
if (reached.length) fail("a failed consent read let a write through: unknown isn't yes");
if (!/couldn't confirm/.test((await res[0].clone().json()).error?.message || "")) fail("a failed read doesn't say it couldn't check");
world.dbDown = false;

// removing a duplicate has its own approval each time, and isn't the connected listing
if (g.isProfileWrite("https://mybusinessbusinessinformation.googleapis.com/v1/locations/999", "DELETE")) fail("removing a duplicate listing now needs this consent, which the connected client can't give for another listing");

// every writer loads the guard
for (const f of fs.readdirSync(FN).filter((x) => x.endsWith(".js"))) {
  const s = code(fs.readFileSync(`${FN}/${f}`, "utf8"));
  const writes = /mybusiness[a-z]*\.googleapis\.com/.test(s) && /method: *"(PATCH|PUT|DELETE)"|\/(localPosts|media)`/.test(s);
  if (!writes || f === "_google-consent.js" || f === "_deadline.js") continue;
  if (!/require\("\.\/_deadline"\)/.test(s)) fail(`${f} writes to Google without loading the guard`);
}

// the record
const PF = read("netlify/functions/portal-google-consent.js");
if (!/action === "read" \? await requirePortalOwnerOrWorkspace\(event, clientId\) : await requirePortalOwner\(event, clientId\)/.test(PF)) fail("someone other than the portal owner can agree or withdraw");
if (!/wording: CONSENT_WORDING/.test(PF) || !/by_email: gate\.email/.test(PF) || !/wording_version: CONSENT_VERSION/.test(PF)) fail("the agreement isn't saved with its wording, version and who");
if (!/body\.wording_version !== CONSENT_VERSION/.test(PF)) fail("a client can agree to wording the page didn't show");
if (!/consent\.agreed !== \(action === "agree"\)/.test(PF)) fail("an agreement is reported without reading it back");
if (!/const told_rga = await tellRga\(clientId/.test(PF)) fail("a withdrawal doesn't tell RGA");

// the two places that must ask first
const OI = code(read("netlify/functions/oauth-google-init.js"));
if (!/readConsent\(clientId\)\)\.agreed\) return \{ statusCode: 409/.test(OI)) fail("Google can be connected without the tick");
const VR = code(read("netlify/functions/v2-respond-review.js"));
const a = VR.indexOf("readConsent(clientId)"), b = VR.indexOf("client_google_oauth");
if (a < 0 || b < 0 || a > b) fail("a review reply doesn't check the client's authorization first");

// what the client and admin see
const PJ = read("portal/portal.js");
if (!PJ.includes('step.clientForm === "oauth_grant" ? googleConsentFormHtml(clientId)')) fail("the Connect card has no tick");
// every connect button a client can press while not connected sits inside the tick (the checklist's two as well as the row's: the first version only covered the row, and the browser showed it)
if ((PJ.match(/googleConsentFormHtml\(clientId/g) || []).length < 3) fail("a Connect Google button sits outside the tick");
if (!/data-gconsent-tick\]"\)\.checked/.test(PJ)) fail("Connect goes ahead without the tick");
if (!/saveGoogleConsent\(clientId, "agree"\)/.test(PJ) || !/data-gconsent-withdraw/.test(PJ)) fail("the portal can't record or withdraw the agreement");
if (!/res\.status === 409 && data\.needs_consent/.test(PJ)) fail("Reconnect and the banner dead-end when consent is missing");
for (const w of g.CONSENT_COVERS) if (!PJ.includes(JSON.stringify(w))) fail(`the portal doesn't show "${w}", so the client agreed to a list they didn't see`);
if (!PJ.includes(`const GOOGLE_CONSENT_VERSION = "${g.CONSENT_VERSION}"`)) fail("the portal's wording version isn't the server's");
const AJ = read("admin/admin.js");
if (!/id === "m1\.access\.gbp" \? `<div data-admin-gconsent/.test(AJ) || !/Consent on record/.test(AJ) || !/No consent on record/.test(AJ)) fail("admin step 2 doesn't show the consent record");

// Google lives in Setup Step 3 (approved client_setup_google_in_step3_v1, 11-2): never in Step 4's list, one consent line, a missing OK can't read complete
{
  const i = PJ.indexOf("function renderActionItemsLive"), j = PJ.indexOf("\nfunction ", i + 20);
  const S4 = i < 0 ? "" : PJ.slice(i, j < 0 ? undefined : j);
  if (!S4) fail("can't find Step 4's action list to check");
  if (/data-gconsent-line|Google connected|data-gconsent/.test(code(S4))) fail("Step 4's list shows a Google row or the consent line again");
  if ((PJ.match(/<div data-gconsent-line/g) || []).length !== 1) fail("there isn't exactly one consent line");
  const D = PJ.slice(PJ.indexOf("function buildDetectedSetupHtml"));
  if (D.indexOf("<div data-gconsent-line") < 0 || D.indexOf("<div data-gconsent-line") > D.indexOf("${rowsHtml}")) fail("the consent line isn't in Step 3's Connect card above the connected rows");
  const A = PJ.slice(PJ.indexOf("function applyGoogleConsentToStep3"), PJ.indexOf("function applyGoogleConsentToStep3") + 1600);
  if (!/One thing left/.test(A) || !/e\.hidden = !agreed/.test(A) || !/display = "block"/.test(A) || !/pm-tracker/.test(A) || !/pm-step cur/.test(A)) fail("a missing OK can still read complete: the eyebrow, the open body, the all-set block or the tracker isn't handled");
  if (!/data-gset-allset/.test(D)) fail("the all-set block can't be hidden while the OK is missing");
  const F1 = PJ.slice(PJ.indexOf("async function fillGoogleConsentLine"), PJ.indexOf("function applyGoogleConsentToStep3"));
  const rd = F1.indexOf("consent = j.consent;"), ap = F1.indexOf("applyGoogleConsentToStep3(");
  if (rd < 0 || ap < rd || !/!r\.ok \|\| !j\.ok\) return;/.test(F1) || !/catch \{ return; \}/.test(F1) || F1.slice(0, rd).includes("applyGoogleConsentToStep3")) fail("Step 3 changes before the consent read answered, or after a failed read");
  if (!PJ.includes(`"<b>You withdrew your OK,</b> so RGA's changes to your Google profile are stopped."`) || /before RGA changes anything on your Google profile, so changes are stopped for now\.[^`]*You withdrew/.test(PJ)) fail("the withdrawn line isn't the approved words");
  if (!/pm-modal-title/.test(PJ) || !/\.pm-modal-title \{[^}]*margin-right:44px/.test(read("portal/portal.css")) || /<h3 style="margin:0 0 8px;font-size:var\(--fs-2xl\)/.test(PJ)) fail("a dialog title can run under the X");
}

// recording
const CP = read("netlify/functions/_call-providers.js");
if (!/recording_enabled: false/.test(CP) || /recording_enabled: true/.test(code(CP))) fail("new tracking numbers record calls");
if (/may be recorded/.test(code(CP))) fail("the number tells callers they may be recorded while it isn't");
const PV = read("privacy/index.html");
if (!/Calls aren't recorded unless you separately turn recording on in writing/.test(PV)) fail("the privacy page doesn't say recording is off");
if (!/You authorize this with a separate tick, naming these changes, when you connect Google/.test(PV)) fail("the privacy page doesn't say how the client authorizes changes");
for (const f of ["data/playbooks/client-steps.json", "data/playbooks/playbooks.json"]) if (/This call may be recorded/.test(read(f))) fail(`${f} still tells the client calls may be recorded`);

if (F.length) { console.error(`🔴 a Google change or a call can go ahead without the client's OK — ${F.length}:\n${F.slice(0, 30).map((x) => `   · ${x}`).join("\n")}`); process.exit(1); }
console.log("✅ no Google write without the client's recorded OK (refused, withdrawn, unreadable and unknown-location all stop it, reads don't wait); the tick and the record are on screen; calls aren't recorded");
