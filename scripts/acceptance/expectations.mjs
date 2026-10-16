// Optional per-step expectations for acceptance-walk.mjs.
//
// Each entry: { admin?: RegExp[], portal?: RegExp[], allowText?: RegExp[] }. Every pattern must match the step's visible
// text (title + opened body) on that side, or the step FAILS with "expected /…/ not on the admin|portal".
// Keep these to facts that are TRUE FOR EVERY CLIENT — a pattern that quotes one client's data is a
// gate that fails when the next client signs up.
//
// `allowText` — text that is DELIBERATELY template-shaped on that step (e.g. CRM merge fields the
// draft tells the client to replace). It is removed before the junk scan, and only the exact
// names listed — any other `{{…}}` on the step still fails.
export const EXPECTATIONS = {
  "m1.gbp.photos": { admin: [/photo/i], portal: [/photo/i] },
  "m1.kickoff.call": { admin: [/kickoff|call/i], portal: [/call/i] },
  "m1.review.first_5": { admin: [/review/i], portal: [/review/i] },
  // The review-request drafts carry merge fields on purpose ("Replace {{first_name}} and {{review_link}}
  // with your CRM merge fields before sending").
  "m1.review.system": { admin: [/review/i], allowText: [/\{\{(first_name|review_link)\}\}/g] },
  "m1.strategy.keywords_locations": { admin: [/keyword/i], portal: [/keyword|search/i] },
  "m1.gbp.verify": { admin: [/verif/i], portal: [/verif|Google/i] },
  // 🔒 step 7 "Check your business on Google" (business_on_google_v1): true in every state it can be in — open (Google beside what
  // they told us), with RGA ("RGA is changing this on Google"), done ("On your Google Business Profile"), or waiting on Google access
  "m1.gbp.business_facts": { admin: [/Match business facts to Google/i], portal: [/Check your business on Google/i, /What Google shows customers|RGA is changing this on Google|On your Google Business Profile|Google|verif/i] },
};
