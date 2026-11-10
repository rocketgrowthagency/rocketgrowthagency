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
    if (m && !(r.cardText || "").includes(m[1])) F.push(`${tag}: the chip date "${m[1]}" is not on the row's own card (the card says a different date or none)`);
    if (r.moreCount && !r.moreInside) F.push(`${tag}: its "More" is drawn outside the row's body (loose between the cards)`);
    if (r.id === "m2.start.open_month" && !/[A-Z][a-z]{2} \d{1,2}/.test(r.cardText || "")) F.push(`${tag}: the Open the month card names no date`);
  }
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
  return F;
}
