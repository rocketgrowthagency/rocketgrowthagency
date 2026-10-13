// netlify-credit-forecast.mjs — the arithmetic behind check-netlify-credits-will-last (2026-10-12). Pure: no API, no
// clock of its own, so the gate can prove it on fixed scenarios before trusting it on live data.
// → project_netlify_credits_burn_is_deploys
export function forecast({ deploys, bandwidthBytes, periodStart, periodEnd, now, anchorLeft, anchorAt, included = 1000, perDeploy = 15, perGb = 10, dailyMax = 10 }) {
  const day = 86400000;
  const start = new Date(periodStart), end = new Date(periodEnd), at = new Date(anchorAt), t = new Date(now);
  const from = at > start ? at : start;
  const left0 = at > start ? Number(anchorLeft) : included;
  const prod = deploys.filter((d) => d.context === "production" && new Date(d.created_at) >= start);
  const ago = (d) => t - new Date(d.created_at);
  const last24 = prod.filter((d) => ago(d) < day).length;
  const last48 = prod.filter((d) => ago(d) < 2 * day).length;
  const last7 = prod.filter((d) => ago(d) < 7 * day).length;
  const sinceAnchor = prod.filter((d) => new Date(d.created_at) >= from).length;
  const gb = (Number(bandwidthBytes) || 0) / 1e9;
  const gbPerDay = gb / Math.max(1, (t - start) / day);
  const left = left0 - (sinceAnchor * perDeploy + gbPerDay * ((t - from) / day) * perGb);
  const rate = (last48 / 2) * perDeploy + gbPerDay * perGb;   // the last 2 days' pace, not 7 (a week-long average stays red a week after the fix)
  const daysLeft = Math.max(0, (end - t) / day);
  const atReset = left - rate * daysLeft;
  const problems = [];
  if (atReset < 0) problems.push(`at the last 2 days' pace the credits run out in about ${Math.max(0, Math.floor(left / Math.max(rate, 1e-9)))} day(s), before the reset on ${end.toISOString().slice(0, 10)} — batch deploys (one per finished task)`);
  if (last24 > dailyMax) problems.push(`${last24} production deploys in the last 24h (max ${dailyMax}) — that is per-fix deploying again`);
  return { left, left0, from, sinceAnchor, last24, last48, last7, gbPerDay, atReset, end, problems };
}
