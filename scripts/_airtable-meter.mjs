// _airtable-meter.mjs — counts every Airtable API call a process makes, and (opt-in) caches repeat reads.
//
// 🔴 WHY (2026-10-08): the workspace hit 125,148 of its 100,000 monthly Airtable API calls and nothing could
// say which job spent them. A full read of the leads table is only ~17 calls, so the volume (~4,000/day) has
// to come from something calling often — and guessing is how the wrong job gets switched off.
//
// Loaded with `NODE_OPTIONS=--import=<this file>` by the scheduled shell jobs. For each node process it
// appends ONE line to output/airtable-calls.log:   <iso>  <job>  <script>  calls=<n> get=<n> write=<n> cached=<n>
//
// 🔒 CACHING IS OPT-IN (AIRTABLE_GET_CACHE=1) and is set ONLY by the read-only nightly health check: a cached
// read inside a job that also WRITES (sends, scoring, publishing) could act on stale data — e.g. send twice.
// Cache = identical GET URL within AIRTABLE_GET_CACHE_TTL_S (default 1800s), stored under /tmp.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const LOG = process.env.AIRTABLE_METER_LOG
  || path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/%20/g, " "), "../output/airtable-calls.log");
const JOB = process.env.AIRTABLE_METER_JOB || "unlabelled";
const CACHE = process.env.AIRTABLE_GET_CACHE === "1";
const TTL = Number(process.env.AIRTABLE_GET_CACHE_TTL_S || 1800) * 1000;
const DIR = "/tmp/rga-airtable-get-cache";
const n = { calls: 0, get: 0, write: 0, cached: 0 };

const orig = globalThis.fetch;
if (typeof orig === "function") {
  globalThis.fetch = async function meteredFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (!/https:\/\/api\.airtable\.com\//.test(url)) return orig(input, init);
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    if (method === "GET" && CACHE) {
      const key = crypto.createHash("sha1").update(url).digest("hex");
      const f = `${DIR}/${key}.json`;
      try {
        const st = fs.statSync(f);
        if (Date.now() - st.mtimeMs < TTL) {
          n.cached++;
          return new Response(fs.readFileSync(f, "utf8"), { status: 200, headers: { "content-type": "application/json" } });
        }
      } catch { /* not cached */ }
      n.calls++; n.get++;
      const res = await orig(input, init);
      if (res.ok) {
        try { const body = await res.clone().text(); fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, body); } catch { /* cache is best-effort */ }
      }
      return res;
    }
    n.calls++; if (method === "GET") n.get++; else n.write++;
    return orig(input, init);
  };
}

process.on("exit", () => {
  if (!n.calls && !n.cached) return;
  const script = path.basename(process.argv[1] || "node");
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()}  ${JOB}  ${script}  calls=${n.calls} get=${n.get} write=${n.write} cached=${n.cached}\n`);
  } catch { /* metering must never break a job */ }
});
