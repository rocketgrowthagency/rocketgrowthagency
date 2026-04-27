// Monthly report generator. Pulls everything from Supabase + renders a portable HTML report
// (printable to PDF in any browser). Used for both Month 1 close-out + Month 2+ monthly reports.
//
// Usage:
//   import { generateReport } from "./lib/report-generator.mjs";
//   const { html, summary } = await generateReport(clientId, { reportingMonth: "2026-04-01" });

import "dotenv/config";

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supa(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} ${path}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
function fmtMonthLabel(d) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long" });
}
function delta(curr, prev) {
  if (curr == null || prev == null) return null;
  if (prev === 0) return curr > 0 ? "+∞" : "0";
  const pct = ((curr - prev) / prev) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}
function deltaColor(curr, prev, betterIsHigher = true) {
  if (curr == null || prev == null) return "#6b7280";
  const better = betterIsHigher ? curr > prev : curr < prev;
  return better ? "#16a34a" : (curr === prev ? "#6b7280" : "#dc2626");
}
function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export async function generateReport(clientId, { reportingMonth = null } = {}) {
  // Default to current month
  if (!reportingMonth) {
    const d = new Date();
    reportingMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }
  const monthDate = new Date(reportingMonth);
  const prevDate = new Date(monthDate); prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-01`;
  const monthLabel = fmtMonthLabel(monthDate);

  // Pull all data in parallel
  const [
    [client],
    monthlyRecords,
    prevMonthlyRecords,
    rankings,
    gbpSnapshots,
    reviews,
    citations,
    backlinks,
  ] = await Promise.all([
    supa(`/clients?id=eq.${clientId}&select=*`),
    supa(`/client_monthly_records?client_id=eq.${clientId}&reporting_month=eq.${reportingMonth}&select=*`),
    supa(`/client_monthly_records?client_id=eq.${clientId}&reporting_month=eq.${prevMonth}&select=*`),
    supa(`/client_keyword_rankings?client_id=eq.${clientId}&select=*&order=measured_at.desc&limit=200`),
    supa(`/client_gbp_snapshots?client_id=eq.${clientId}&select=*&order=snapshot_date.desc&limit=10`),
    supa(`/client_reviews_history?client_id=eq.${clientId}&select=*&order=review_date.desc&limit=50`).catch(() => []),
    supa(`/client_citations?client_id=eq.${clientId}&select=*`).catch(() => []),
    supa(`/client_backlinks?client_id=eq.${clientId}&select=*`).catch(() => []),
  ]);

  if (!client) throw new Error(`Client ${clientId} not found`);

  // --- Compute ranking deltas ---
  const latestByKeyword = new Map();
  const previousByKeyword = new Map();
  const monthEnd = new Date(monthDate); monthEnd.setMonth(monthEnd.getMonth() + 1);
  rankings.forEach((r) => {
    const measured = new Date(r.measured_at);
    if (r.grid_session_id) return; // skip grid points for the simple table
    if (measured >= monthDate && measured < monthEnd) {
      if (!latestByKeyword.has(r.keyword)) latestByKeyword.set(r.keyword, r);
    } else if (measured < monthDate) {
      if (!previousByKeyword.has(r.keyword)) previousByKeyword.set(r.keyword, r);
    }
  });

  // --- Compute GBP delta ---
  const currGbp = gbpSnapshots[0] || {};
  const prevGbp = gbpSnapshots.find((s) => new Date(s.snapshot_date) < monthDate) || {};

  // --- Reviews this month ---
  const reviewsThisMonth = reviews.filter((r) => {
    const d = new Date(r.review_date);
    return d >= monthDate && d < monthEnd;
  });
  const newReviewCount = reviewsThisMonth.length;

  // --- Tasks completed this month ---
  const tasksDone = monthlyRecords[0]?.data?.tasks
    ? Object.entries(monthlyRecords[0].data.tasks).filter(([_, t]) => t.status === "done")
    : [];

  // --- Build HTML ---
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escape(monthLabel)} Report — ${escape(client.business_name)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; max-width: 880px; margin: 36px auto; padding: 0 24px; color: #1f2937; line-height: 1.55; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 32px 0 12px; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  h3 { font-size: 14px; margin: 20px 0 8px; color: #374151; }
  .meta { color: #6b7280; margin: 0 0 22px; font-size: 14px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 12px 0; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; background: #fafafa; }
  .kpi .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi .value { font-size: 24px; font-weight: 700; color: #111827; margin-top: 4px; }
  .kpi .delta { font-size: 12px; margin-top: 2px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 18px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
  th { background: #f9fafb; font-weight: 600; color: #374151; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .pill-up { background: #dcfce7; color: #166534; }
  .pill-down { background: #fee2e2; color: #991b1b; }
  .pill-flat { background: #f3f4f6; color: #6b7280; }
  ul.work-done { padding-left: 18px; margin: 8px 0; }
  ul.work-done li { margin-bottom: 4px; font-size: 13px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>

<header>
  <h1>${escape(client.business_name)}</h1>
  <p class="meta">${escape(monthLabel)} Performance Report &nbsp;•&nbsp; Prepared by Rocket Growth Agency</p>
</header>

<h2>Headline KPIs</h2>
<div class="kpi-grid">
  <div class="kpi">
    <div class="label">GBP Rating</div>
    <div class="value">${currGbp.rating != null ? currGbp.rating.toFixed(1) + "★" : "—"}</div>
    <div class="delta" style="color:${deltaColor(currGbp.rating, prevGbp.rating)}">${prevGbp.rating != null ? `was ${prevGbp.rating.toFixed(1)}` : ""}</div>
  </div>
  <div class="kpi">
    <div class="label">Reviews (Total)</div>
    <div class="value">${currGbp.review_count ?? "—"}</div>
    <div class="delta" style="color:${deltaColor(currGbp.review_count, prevGbp.review_count)}">${prevGbp.review_count != null ? `${currGbp.review_count - prevGbp.review_count >= 0 ? "+" : ""}${currGbp.review_count - prevGbp.review_count} this period` : ""}</div>
  </div>
  <div class="kpi">
    <div class="label">New Reviews This Month</div>
    <div class="value">${newReviewCount}</div>
  </div>
  <div class="kpi">
    <div class="label">Keywords Tracked</div>
    <div class="value">${latestByKeyword.size}</div>
  </div>
</div>

${latestByKeyword.size > 0 ? `
<h2>Keyword Rankings</h2>
<table>
  <thead>
    <tr><th>Keyword</th><th>Current Rank</th><th>Previous</th><th>Δ</th></tr>
  </thead>
  <tbody>
    ${[...latestByKeyword.entries()].map(([keyword, curr]) => {
      const prev = previousByKeyword.get(keyword);
      const currRank = curr.map_rank;
      const prevRank = prev?.map_rank;
      let pill = '<span class="pill pill-flat">—</span>';
      if (currRank != null && prevRank != null) {
        const change = prevRank - currRank;
        if (change > 0) pill = `<span class="pill pill-up">▲ ${change}</span>`;
        else if (change < 0) pill = `<span class="pill pill-down">▼ ${Math.abs(change)}</span>`;
        else pill = `<span class="pill pill-flat">—</span>`;
      }
      return `<tr>
        <td>${escape(keyword)}</td>
        <td>${currRank != null ? `#${currRank}` : '<span style="color:#dc2626;">not in top 50</span>'}</td>
        <td>${prevRank != null ? `#${prevRank}` : "—"}</td>
        <td>${pill}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>
` : ""}

${tasksDone.length > 0 ? `
<h2>Work Completed This Month (${tasksDone.length})</h2>
<ul class="work-done">
  ${tasksDone.map(([id, t]) => `<li><strong>${escape(id)}</strong>${t.notes ? ` — ${escape(t.notes)}` : ""}${t.completed_at ? ` <span style="color:#6b7280;font-size:11px;">(${escape(fmtDate(t.completed_at))})</span>` : ""}</li>`).join("")}
</ul>
` : '<h2>Work Completed This Month</h2><p style="color:#6b7280;">No tasks marked done yet for this reporting month. Run the flow to update.</p>'}

${reviewsThisMonth.length > 0 ? `
<h2>New Reviews</h2>
<table>
  <thead><tr><th>Date</th><th>Rating</th><th>Reviewer</th><th>Excerpt</th></tr></thead>
  <tbody>
    ${reviewsThisMonth.slice(0, 10).map((r) => `<tr>
      <td>${escape(fmtDate(r.review_date))}</td>
      <td>${"★".repeat(r.rating || 0)}</td>
      <td>${escape(r.reviewer_name || "Anonymous")}</td>
      <td>${escape((r.review_text || "").slice(0, 120))}${r.review_text?.length > 120 ? "…" : ""}</td>
    </tr>`).join("")}
  </tbody>
</table>
` : ""}

${citations.length > 0 ? `
<h2>Citations Tracked</h2>
<p style="color:#374151;font-size:13px;">${citations.length} citation${citations.length === 1 ? "" : "s"} on file (${citations.filter((c) => c.status === "live").length} live).</p>
` : ""}

${backlinks.length > 0 ? `
<h2>Backlinks Acquired</h2>
<p style="color:#374151;font-size:13px;">${backlinks.length} backlink${backlinks.length === 1 ? "" : "s"} on file.</p>
` : ""}

<h2>Next Month Focus</h2>
<p style="color:#374151;">${escape(monthlyRecords[0]?.data?.next_month_focus || "TBD — covered in the next monthly call.")}</p>

<div class="footer">
  Generated ${fmtDate(new Date())} &nbsp;•&nbsp; Rocket Growth Agency &nbsp;•&nbsp; rocketgrowthagency.com
</div>

</body>
</html>`;

  const summary = {
    client_id: clientId,
    business_name: client.business_name,
    reporting_month: reportingMonth,
    rankings_count: latestByKeyword.size,
    new_reviews: newReviewCount,
    tasks_done: tasksDone.length,
    gbp_rating: currGbp.rating,
    gbp_reviews_total: currGbp.review_count,
  };

  return { html, summary, client };
}

// Save report to filesystem + insert into client_portal_content
export async function saveAndPublishReport(clientId, { reportingMonth = null, outputDir = "./output/reports", publish = true } = {}) {
  const { html, summary, client } = await generateReport(clientId, { reportingMonth });
  const fs = await import("node:fs/promises");
  await fs.mkdir(outputDir, { recursive: true });
  const fileName = `${client.business_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${summary.reporting_month}.html`;
  const filePath = `${outputDir}/${fileName}`;
  await fs.writeFile(filePath, html, "utf8");

  let portalRow = null;
  if (publish) {
    const month = fmtMonthLabel(new Date(summary.reporting_month));
    const r = await fetch(`${SUPA_URL}/rest/v1/client_portal_content`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        workspace_id: client.workspace_id,
        client_id: clientId,
        content_type: "monthly_summary",
        title: `${month} Performance Report`,
        period_label: month,
        summary: `${summary.new_reviews} new reviews • ${summary.tasks_done} tasks completed • ${summary.rankings_count} keywords tracked.`,
        body: html,
        action_label: "View Full Report",
        status: "published",
        visible: true,
        published_at: new Date().toISOString(),
      }),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(`Failed to publish to portal: ${JSON.stringify(result).slice(0, 200)}`);
    portalRow = result?.[0] || result;
  }

  return { filePath, summary, portalRow };
}
