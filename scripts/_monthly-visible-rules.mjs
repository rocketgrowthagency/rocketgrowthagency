// The rules the Monthly tab's browser gate applies to what is VISIBLY DRAWN (monthly_fix_v3, 11-9). Pure: a row is plain data read from the page, so the same rules
// run in the live browser gate and, here, against fixtures. The first version of the browser gate passed with the chip date, the orange row, the stray "Active now"
// on Review replies, step 24's loose "More" and the dateless Open card all on screen, because it read the pill text of rows it had flagged as "self" from the
// module list, never the tag the person sees, never the row's class, never the card beside the chip.
//
// row = { id, tagSelf: the title area shows the "Runs itself" tag, pill, rowCls, statusCls, markerCls, cardText, moreCount, moreInside: every More is inside this .ob-step's .ob-body }
export function visibleRowFailures(rows) {
  const F = [];
  for (const r of rows) {
    const tag = `${r.id} [${r.pill}]`, orange = (c) => /(^|\s)(active|ready)(\s|$)/.test(c || "") && !/(^|\s)queued(\s|$)/.test(c || "");
    const yourMove = /Your move/i.test(r.cardText || "");
    if (r.tagSelf && !yourMove) {
      if (/^Active now$/i.test(r.pill)) F.push(`${tag}: tagged Runs itself and waiting, but the chip says "Active now"`);
      if (orange(r.rowCls)) F.push(`${tag}: a waiting runs-itself row draws the orange active row class (${r.rowCls})`);
      if (orange(r.statusCls)) F.push(`${tag}: a waiting runs-itself row draws the orange chip (${r.statusCls})`);
      if (orange(r.markerCls)) F.push(`${tag}: a waiting runs-itself row draws the orange marker`);
    }
    const m = /·\s*([A-Z][a-z]{2} \d{1,2})\s*$/.exec(r.pill || "");
    if (m && !(r.cardText || "").replace(/[\s\u00a0\u202f]+/g, " ").toLowerCase().includes(m[1].replace(/[\s\u00a0\u202f]+/g, " ").toLowerCase()))   /* 11-9: the card shows "READS DEC 2" (CSS capitals) */ F.push(`${tag}: the chip date "${m[1]}" is not on the row's own card (the card says a different date or none)`);
    if (r.moreCount && !r.moreInside) F.push(`${tag}: its "More" is drawn outside the row's body (loose between the cards)`);
    if (r.id === "m2.start.open_month" && !/[A-Z][a-z]{2} \d{1,2}/.test(r.cardText || "")) F.push(`${tag}: the Open the month card names no date`);
  }
  F.push(...auditRowFailures(rows));
  return F;
}

// ───────────────────────── monthly_audit_v2 (approved 11-9 ~6:40 PM) ─────────────────────────
// Extra row fields (all optional; a rule only fires on the row it names): month ("2026-11-01"), who (the who tag text), sub (the row's subtitle), num (the page number).
const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
export function auditRowFailures(rows) {
  const F = [], by = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    const tag = `${r.id} [${r.pill}]`, card = (r.cardText || "").replace(/[\s\u00a0\u202f]+/g, " ");
    // 1 · the Open the month card dates the MONTH, never a day before it starts
    if (r.id === "m2.start.open_month" && r.month) {
      const m = /Created ([A-Z][a-z]{2}) (\d{1,2})/.exec(card);
      if (m) { const y = Number(r.month.slice(0, 4)), mo = Number(r.month.slice(5, 7)) - 1, got = Date.UTC(MON[m[1]] > mo + 6 ? y - 1 : y, MON[m[1]], Number(m[2])); if (got < Date.UTC(y, mo, 1)) F.push(`${tag}: the Open the month card is dated ${m[1]} ${m[2]}, a day before the month starts`); }
    }
    // 2 · a card that says it is the client's move wears the client chip, never "Active now"
    if (/Client's move/i.test(card) && /^Active now$/i.test(r.pill || "")) F.push(`${tag}: the card says it is the client's move but the chip says "Active now"`);
    if (r.id === "m2.exec.review_push" && /Client's move/i.test(card) && !/^Client's move$/i.test(r.pill || "")) F.push(`${tag}: Review asks waiting on the client must read "Client's move"`);
    if (r.id === "m2.exec.gbp_photos" && /Optional/i.test(card) && /^Active now$/i.test(r.pill || "")) F.push(`${tag}: New photos waiting on the client must read "Client's move \u00B7 optional"`);
    // 3 · Review replies: plain words, no ranking claim
    if (r.id === "m2.exec.review_responses" && /rank/i.test(r.sub || "")) F.push(`${tag}: the Review replies subtitle makes a ranking claim`);
    // 4 · Google posts: RGA drafts, the client approves
    if (r.id === "m2.exec.gbp_posts" && r.who != null && !/^You \+ client$/i.test(r.who)) F.push(`${tag}: Google posts is tagged "${r.who}", not "You + client"`);
    // 5 · step 8 is month-to-date, labeled partial, never presented as final
    if (r.id === "m2.snap.gbp_metrics" && r.cardText != null) {
      if (!/so far/i.test(card) || !/partial/i.test(card)) F.push(`${tag}: step 8 does not say "so far" and "partial"`);
      if (/reads [A-Z][a-z]{2} \d/i.test(card) && !/so far/i.test(card)) F.push(`${tag}: step 8 still waits for the 2nd instead of showing the month so far`);
    }
    // 6 · "nothing changed" only when every link was read
    if (r.id === "m2.exec.listing_upkeep") { const n = /(\d+) of (\d+) listing links? re-read/i.exec(card); if (/nothing changed/i.test(card) && (!n || n[1] !== n[2])) F.push(`${tag}: says "nothing changed" without every listing link read`); }
    // 7, 8 · the two new steps exist, run themselves, and are numbered after the 25
    if (r.id === "m2.exec.profile_watch" || r.id === "m2.exec.tracking_check") {
      if (r.tagSelf === false) F.push(`${tag}: must be tagged Runs itself`);
      if (r.num != null && Number(r.num) < 26) F.push(`${tag}: numbered ${r.num}; an added step is numbered after the existing 25`);
      if (r.id === "m2.exec.tracking_check" && /recorded this month: yes/i.test(card) && /: couldn't check\b/i.test(card))   /* 11-9: the card's own "It never says working" is an explanation, not a status */ F.push(`${tag}: says working and couldn't check at once`);
    }
    // 9 · Plan the month does not suggest before last month is frozen
    if (r.id === "m2.plan.rotating_focus" && /Waiting for the month's suggestion/i.test(card) && !/Suggestion ready [A-Z][a-z]{2} \d{1,2}|Plans start with Month 2/.test(card))   /* a month before the cycle says when plans start */ F.push(`${tag}: waiting for the suggestion but names no "Suggestion ready <date>"`);
    if (r.id === "m2.plan.rotating_focus" && r.plan_before_freeze) F.push(`${tag}: suggests a focus before last month's numbers are frozen`);
  }
  for (const id of ["m2.exec.profile_watch", "m2.exec.tracking_check"]) if (rows.length > 6 && !by.has(id)) F.push(`${id}: the step is not drawn on the Monthly tab`);
  return F;
}
/** The "Every quarter" preview (monthly_quarter_preview_v1). p = { pill, text, nums:[…], buttons (not counting Fold), titles:[…], notFor: bool (the lead-handling test row says "not for"), applies: bool (it should) } */
export function previewFailures(p) {
  const F = [];
  if (!/^Starts [A-Z][a-z]{2} \d{1,2} \u00B7 Month \d+$/.test((p.pill || "").trim())) F.push('Every quarter: the header pill is not "Starts <date> · Month N"');
  if (!/Preview only/i.test(p.text || "") || !/Months 3, 6, 9 and 12/.test(p.text || "")) F.push('Every quarter: the "Preview only" band is missing');
  if (JSON.stringify(p.nums || []) !== JSON.stringify([14, 15, 16, 17, 18, 19, 20])) F.push(`Every quarter: the preview rows are numbered ${JSON.stringify(p.nums)}, not 14 to 20`);
  if (/\(quarterly\)/i.test((p.titles || []).join(" ") + " " + (p.text || ""))) F.push('Every quarter: a title still carries "(quarterly)"');
  if (p.buttons) F.push("Every quarter: the preview has buttons or Skip (it is read-only)");
  if (p.applies === false && !p.notFor) F.push('Every quarter: the lead-handling test does not apply but the row has no "not for <client>" tag');
  if (!/under "This quarter"/.test(p.text || "") || !/Fold/.test(p.text || "")) F.push('Every quarter: the footer ("Results go into that month\'s report under \'This quarter\'" + Fold) is missing');
  return F;
}
const FIX_BEFORE = [
  { id: "m2.start.open_month", month: "2026-11-01", tagSelf: true, pill: "Done", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "November is open\nCreated Oct 31 by the morning run.", moreCount: 0, moreInside: true },
  { id: "m2.exec.review_push", tagSelf: false, pill: "Active now", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "Client's move\nWaiting for this week's list", moreCount: 0, moreInside: true },
  { id: "m2.exec.gbp_photos", tagSelf: false, pill: "Active now", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "Optional\nNo new photos yet", moreCount: 0, moreInside: true },
  { id: "m2.exec.review_responses", tagSelf: false, sub: "Responding to every review builds trust + is a ranking signal.", pill: "Runs itself", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "x", moreCount: 0, moreInside: true },
  { id: "m2.exec.gbp_posts", tagSelf: false, who: "Runs itself", pill: "Up next", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "x", moreCount: 0, moreInside: true },
  { id: "m2.snap.gbp_metrics", tagSelf: false, pill: "Done", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "Reads Dec 2\nProfile views  reads Dec 2", moreCount: 0, moreInside: true },
  { id: "m2.exec.listing_upkeep", tagSelf: false, pill: "Done", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "2 of 5 listing links re-read Nov 3: nothing changed", moreCount: 0, moreInside: true },
  { id: "m2.exec.profile_watch", tagSelf: false, num: 14, pill: "Done", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "x", moreCount: 0, moreInside: true },
  { id: "m2.plan.rotating_focus", plan_before_freeze: true, tagSelf: false, pill: "Waiting", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "Waiting for the month's suggestion", moreCount: 0, moreInside: true },
];
const FIX_AFTER = [
  { id: "m2.start.open_month", month: "2026-11-01", tagSelf: true, pill: "Done", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "November is open\nCreated Nov 1 by the morning run.", moreCount: 0, moreInside: true },
  { id: "m2.exec.review_push", tagSelf: false, pill: "Client's move", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "Client's move\nWaiting for this week's list", moreCount: 0, moreInside: true },
  { id: "m2.exec.gbp_photos", tagSelf: false, pill: "Client's move \u00B7 optional", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "Optional\nNo new photos yet", moreCount: 0, moreInside: true },
  { id: "m2.exec.review_responses", tagSelf: false, sub: "Every review gets a reply; the client approves each before it posts.", pill: "Runs itself", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "x", moreCount: 0, moreInside: true },
  { id: "m2.exec.gbp_posts", tagSelf: false, who: "You + client", pill: "Up next", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "x", moreCount: 0, moreInside: true },
  { id: "m2.snap.gbp_metrics", tagSelf: true, pill: "Runs itself", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "So far\npartial \u00B7 updated Nov 9\nSo far \u00B7 partial, updated Nov 9", moreCount: 0, moreInside: true },
  { id: "m2.exec.listing_upkeep", tagSelf: true, pill: "Runs itself", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "5 of 5 listing links re-read Nov 3: nothing changed", moreCount: 0, moreInside: true },
  { id: "m2.exec.profile_watch", tagSelf: true, num: 26, pill: "Runs itself", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "x", moreCount: 0, moreInside: true },
  { id: "m2.exec.tracking_check", tagSelf: true, num: 27, pill: "Runs itself", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "x", moreCount: 0, moreInside: true },
  { id: "m2.plan.rotating_focus", tagSelf: false, pill: "Waiting", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "Waiting for the month's suggestion\nSuggestion ready Dec 2.", moreCount: 0, moreInside: true },
];
const PREVIEW_BEFORE = { pill: "Month 3", text: "Starts in Month 3 (January)\nTheir numbers: booked jobs and revenue (quarterly)", nums: [], titles: ["Video (optional)", "Links and local press (quarterly)"], buttons: 0, applies: false, notFor: false };
const PREVIEW_AFTER = { pill: "Starts Jan 1 \u00B7 Month 3", text: "Preview only. These open in Months 3, 6, 9 and 12. Nothing here can be done or skipped yet.\nResults go into that month's report under \"This quarter\". Fold", nums: [14, 15, 16, 17, 18, 19, 20], titles: ["Video"], buttons: 0, applies: false, notFor: true };
export function auditSelfTest() {
  const F = [], before = [...auditRowFailures(FIX_BEFORE), ...previewFailures(PREVIEW_BEFORE)].join("\n"), after = [...auditRowFailures(FIX_AFTER), ...previewFailures(PREVIEW_AFTER)];
  for (const [re, what] of [[/a day before the month starts/, "the Open the month date before the month"], [/chip says "Active now"/, "Active now on a client's move card"], [/must read "Client's move"\n?/, "Review asks chip"], [/Client's move · optional/, "New photos chip"], [/ranking claim/, "the replies ranking claim"],
    [/not "You \+ client"/, "the Google posts who tag"], [/does not say "so far"/, "step 8 not month-to-date"], [/without every listing link read/, "nothing changed without every link read"], [/numbered 14/, "the new step numbered into the old range"],
    [/names no "Suggestion ready/, "the plan waiting with no date"], [/before last month's numbers are frozen/, "the plan suggesting before the freeze"], [/not drawn on the Monthly tab/, "a missing new step"],
    [/header pill is not/, "the preview pill"], [/Preview only/, "the preview band"], [/not 14 to 20/, "the preview numbers"], [/\(quarterly\)/, "(quarterly) in a title"], [/no "not for/, "the not-for tag"], [/footer/, "the preview footer"]])
    if (!re.test(before)) F.push(`audit-rules: the new rule does NOT fire on the live-before state: ${what}`);
  if (after.length) F.push(`audit-rules: the rules fire on the fixed state: ${after.join(" | ")}`);
  return F;
}

// Fixtures. LIVE_BEFORE is the state the owner saw at 4:43 PM on 11-9 (rebuilt from his walk and from the code that drew it): every assertion must fire on it.
const OK_CARD = (t) => `Waiting\nruns itself\n${t}`;
export const LIVE_BEFORE = [
  { id: "m2.snap.grid_scan", tagSelf: true, pill: "Runs itself · Dec 1", rowCls: "ob-step active", statusCls: "ob-status active", markerCls: "active", cardText: OK_CARD("next Nov 11"), moreCount: 1, moreInside: true },
  { id: "m2.snap.gbp_metrics", tagSelf: true, pill: "Runs itself · Dec 1", rowCls: "ob-step active", statusCls: "ob-status active", markerCls: "active", cardText: OK_CARD("reads Dec 2"), moreCount: 1, moreInside: true },
  { id: "m2.exec.review_responses", tagSelf: true, pill: "Active now", rowCls: "ob-step active", statusCls: "ob-status active", markerCls: "active", cardText: OK_CARD("No new review this week"), moreCount: 1, moreInside: true },
  { id: "m2.call.monthly", tagSelf: false, pill: "Up next", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "After the report", moreCount: 1, moreInside: false },
  { id: "m2.start.open_month", tagSelf: true, pill: "Done", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "November is open\nCreated. It never makes two.", moreCount: 1, moreInside: true } ];
export const LIVE_AFTER = [
  { id: "m2.snap.grid_scan", tagSelf: true, pill: "Runs itself · Nov 11", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: OK_CARD("next Nov 11"), moreCount: 1, moreInside: true },
  { id: "m2.exec.listing_upkeep", tagSelf: true, pill: "Runs itself", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: OK_CARD("every quarter"), moreCount: 1, moreInside: true },
  { id: "m2.exec.review_responses", tagSelf: true, pill: "Runs itself", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: OK_CARD("No new review this week"), moreCount: 1, moreInside: true },
  { id: "m2.exec.review_push", tagSelf: false, pill: "Active now", rowCls: "ob-step active", statusCls: "ob-status active", markerCls: "active", cardText: "Your move", moreCount: 1, moreInside: true },
  { id: "m2.call.monthly", tagSelf: false, pill: "Up next", rowCls: "ob-step queued", statusCls: "ob-status queued", markerCls: "queued", cardText: "After the report", moreCount: 1, moreInside: true },
  { id: "m2.start.open_month", tagSelf: true, pill: "Done", rowCls: "ob-step done", statusCls: "ob-status done", markerCls: "done", cardText: "November is open\nCreated Nov 1 by the morning run.", moreCount: 1, moreInside: true } ];

/** -> failure strings when the rules do not behave: they must fire all five kinds on the live-before rows and stay silent on the fixed rows. */
export function visibleRulesSelfTest() {
  const F = [], before = visibleRowFailures(LIVE_BEFORE).join("\n"), after = visibleRowFailures(LIVE_AFTER);
  for (const [re, what] of [[/chip says "Active now"/, "an Active now chip on a runs-itself row"], [/orange active row class/, "the orange row class"], [/orange chip/, "the orange chip"], [/chip date "Dec 1"/, "a chip date the card does not carry"], [/More" is drawn outside/, "step 24's loose More"], [/Open the month card names no date/, "a dateless Open the month card"]])
    if (!re.test(before)) F.push(`visible-rules: the tightened rule does NOT fire on the live-before state: ${what}`);
  if (after.length) F.push(`visible-rules: the rules fire on the fixed state: ${after.join(" | ")}`);
  F.push(...auditSelfTest());
  return F;
}
