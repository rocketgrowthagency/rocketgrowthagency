/**
 * verification-signals.mjs — ONE definition of the six signals the 6/6 gate scores.
 *
 * Extracted from step-6-voiceover.mjs on 2026-08-17 so the rule can be tested directly instead of
 * re-implemented in a test (which is how two implementations of the hero-band check drifted apart and
 * cost 18 good videos — see scripts/lib/hero-band.mjs).
 *
 * THE SIX ARE THE SIX WE CAN ACTUALLY OBSERVE (2026-07-02, Chris: "only 6/6 sends"). Google blocks
 * posts / description / social from all automated access, so those are recorded for the absence-claim
 * gates but never scored here.
 *
 * Each signal answers "did we OBSERVE this?", never "is the answer flattering?". A business with zero
 * reviews, no photos or no hours is a perfectly verified business — and our best kind of prospect.
 */

/**
 * @param {object} audit  the step-2.5 findings object
 * @returns {{website:boolean, mobile:boolean, hours:boolean, categories:boolean, reviews:boolean, operational:boolean}}
 */
export function obtainableSignals(audit) {
  const gbp = audit?.gbp || {};
  return {
    website: audit?.website?.websiteAuditVerified === true,
    mobile: audit?.mobile?.mobileAuditVerified === true,
    hours: gbp.hoursVerified === true,
    categories: gbp.categoriesCountVerified === true,
    // "The reviews state was READABLE." A numeric count (including 0) is a read. A null count is not —
    // unless step-2.5 positively verified the empty state (no rating widget, no review cards, AND an
    // explicit "be the first to review" affordance), which is a genuine observation of zero reviews.
    // A plain read failure leaves both sides false and the lead correctly fails the gate.
    reviews: Number.isFinite(gbp.reviewCount) || gbp.reviewAbsenceVerified === true,
    operational: gbp.businessStatus === 'OPERATIONAL' || gbp.businessStatus == null,
  };
}

/** How many of the six were observed, and whether that is all of them. */
export function scoreSignals(audit) {
  const s = obtainableSignals(audit);
  const list = [s.website, s.mobile, s.hours, s.categories, s.reviews, s.operational];
  const verifiedCount = list.filter(Boolean).length;
  return { signals: s, verifiedCount, totalSignals: list.length, fullyVerified: verifiedCount === list.length };
}
