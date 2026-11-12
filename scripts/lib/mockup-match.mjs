// mockup-match.mjs — HOW MUCH OF AN APPROVED MOCKUP'S WORDING IS ON THE LIVE SCREEN (checkers build 11-11). Pure, so
// check-live-matches-the-approved-mockup.mjs proves it on fixtures every run.
// 🔑 THE LOAD-BEARING WORDS, NOT THE WHOLE PAGE: a mockup's headings (h1-h4), buttons and summaries are what Chris agreed to and what a
// rebuild paraphrases. Its sample content, options and annotations are not the product, so they are left out (CHROME) and a whole-page
// diff (which cried wolf) is never attempted. → feedback_a_gate_that_cannot_fail
const decode = (s) => String(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, "—").replace(/&middot;/g, "·").replace(/&#\d+;/g, " ");
export const norm = (s) => decode(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
// the mockup's own furniture: option labels, before/after, notes to Chris, dates, version names
export const CHROME = /\b(option|options|mockup|approve|approved|recommended|before|after|today|proposed|why|decision|decisions|note|notes|legend|v\d+|what changes|what stays|for chris|chris)\b|^\d|^[a-z]$|\?$/i;

/** mockup html → the distinct load-bearing phrases (3 to 80 characters, chrome left out) */
export function phrasesOf(html) {
  const body = String(html || "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, " ");
  const out = new Set();
  const take = (raw) => { const t = decode(raw).replace(/\s+/g, " ").trim(); if (t.length >= 3 && t.length <= 80 && !CHROME.test(t)) out.add(t); };
  // h1/h2 are the mockup DOCUMENT's own titles ("Step 7: …", "Every state"); the product's words are the mock screen's card titles,
  // buttons, summaries, and its labelled bits (btn, tag, pill, badge)
  for (const m of body.matchAll(/<(h[34]|button|summary)\b[^>]*>([\s\S]*?)<\/\1>/gi)) take(m[2]);
  for (const m of body.matchAll(/<(span|a|div|b|em)\b[^>]*class="(?:[^"]*\s)?(btn|button|tag|pill|badge)(?:\s[^"]*)?"[^>]*>([^<]{3,80})</gi)) take(m[3]);
  return [...out];
}

/** phrases + the live screen's text → { found, missing, ratio } */
export function matchRatio(phrases, liveText) {
  const live = norm(liveText);
  const found = [], missing = [];
  for (const p of phrases) (live.includes(norm(p)) ? found : missing).push(p);
  return { found, missing, ratio: phrases.length ? found.length / phrases.length : null };
}

/** results { id: { ratio } } vs baseline { id: ratio } → drops (fell more than tol below what was recorded) and fresh (no baseline yet) */
export function judge(results, baseline, tol = 0.1) {
  const drops = [], fresh = [];
  for (const [id, r] of Object.entries(results)) {
    if (r.ratio == null) continue;
    if (!(id in baseline)) { fresh.push(id); continue; }
    if (r.ratio < baseline[id] - tol) drops.push({ id, was: baseline[id], now: r.ratio });
  }
  return { drops, fresh };
}
