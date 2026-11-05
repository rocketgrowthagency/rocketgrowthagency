// managed-portal-scenarios.mjs — the clients the managed-portal gate and the parity proof draw. Every business here is invented. Four shapes on
// purpose (feedback_a_rule_tested_on_one_client_is_shaped_to_that_client): a plumber who goes to customers, a storefront with no service area,
// a business with NO website, and one where Google has nothing yet. None of them is RGA, and nothing in the product keys on a name.
const DAYS = (open, close, closed = []) => Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, closed.includes(d) ? { closed: true } : { open, close }]));
const done = (extra = {}) => ({ status: "done", completed_at: "2026-11-02T18:00:00Z", completed_by: "rga", ...extra });
const BASE_TASKS = {
  "m1.kickoff.call": done({ completed_by: "client" }),
  "m1.access.website": done({ completed_by: "client", client_input: { via: "invite", platform: "wix" } }),
  "m1.access.gbp": done({ completed_by: "client" }), "m1.access.analytics": done({ completed_by: "client" }), "m1.access.search_console": done({ completed_by: "client" }),
  "m1.audit.gbp_duplicate": done({ outcome_data: { verdict: "clean", duplicates: [] } }),
  "m1.gbp.verify": done({ detected: { verdict: "confirmed", evidence: "Google confirms your profile is verified" } }),
};
export const SERVICES = [["drain", "Drain cleaning"], ["water", "Water heaters"], ["leak", "Leak repair"], ["sewer", "Sewer lines"]].map(([key, label]) => ({ key, label, kind: "google" }));
const factsNow = (over = {}) => ({ google: { name: "Acme Plumbing", phone: "5550101234", website: "https://acmeplumbing.test", come: false, area: ["Springfield, IL", "Shelbyville, IL", "Capital City, IL", "Ogdenville, IL", "North Haverbrook, IL"], region: "US", ...(over.google || {}) },
  told: { name: "Acme Plumbing", phone: "5550109999", website: "https://acmeplumbing.test", come: false, ...(over.told || {}) },
  same: { name: true, phone: false, website: true, come: true, area: true, ...(over.same || {}) }, recommend: null, missing: [], ...(over.top || {}) });
const hoursNow = (has = true) => ({ has, days: has ? DAYS("08:00", "17:00", ["sat", "sun"]) : {}, holidayDates: {}, split: [] });
const svcNow = (over = {}) => ({ categories: { primary: { label: "Plumber" } }, options: SERVICES, on: ["drain", "water"], suggested: ["leak"], ...over });
const attrNow = (over = {}) => ({ options: [{ key: "wheelchair", label: "Wheelchair accessible entrance", group: "How you work" }, { key: "women_led", label: "Women-owned", about: true }, { key: "veteran_led", label: "Veteran-owned", about: true }], ticked: [], recommend: [], ...over });

export const SCENARIOS = {
  // goes to customers, a phone that disagrees, hours + services + details all to check
  plumber: { tasks: { ...BASE_TASKS }, now: { "m1.gbp.business_facts": factsNow(), "m1.gbp.hours_attributes": hoursNow(), "m1.gbp.services_products": svcNow(), "m1.gbp.attributes": attrNow() } },
  // everything matches: Looks right is the whole step
  allMatch: { tasks: { ...BASE_TASKS }, now: { "m1.gbp.business_facts": factsNow({ told: { phone: "5550101234" }, same: { phone: true } }), "m1.gbp.hours_attributes": hoursNow(), "m1.gbp.services_products": svcNow(), "m1.gbp.attributes": attrNow() } },
  // a storefront: customers come in, no service area on Google, no "only you" details Google offers
  storefront: { tasks: { ...BASE_TASKS }, now: { "m1.gbp.business_facts": factsNow({ google: { name: "Corner Bakery & Co", phone: "5550117777", website: "https://cornerbakery.test", come: true, area: [] }, told: { name: "Corner Bakery & Co", phone: "5550117777", website: "https://cornerbakery.test", come: true }, same: { name: true, phone: true, website: true, come: true, area: null } }),
    "m1.gbp.hours_attributes": hoursNow(), "m1.gbp.services_products": svcNow({ options: [], on: [], suggested: [] }), "m1.gbp.attributes": attrNow({ options: [] }) } },
  // no website anywhere: Google has none, the client told us none
  noWebsite: { website: null, tasks: { ...BASE_TASKS, "m1.access.website": { status: "skipped", client_choice: "no_website" } },
    now: { "m1.gbp.business_facts": factsNow({ google: { website: "" }, told: { website: "" }, same: { website: null } }), "m1.gbp.hours_attributes": hoursNow(), "m1.gbp.services_products": svcNow(), "m1.gbp.attributes": attrNow() } },
  // Google has nothing yet: every row is a blank field, never a guess
  nothingFound: { tasks: { ...BASE_TASKS }, now: { "m1.gbp.business_facts": { google: { name: "", phone: "", website: "", come: null, area: [], region: "US" }, told: {}, same: {}, recommend: null, missing: [] },
    "m1.gbp.hours_attributes": hoursNow(false), "m1.gbp.services_products": svcNow({ categories: {}, options: [] }), "m1.gbp.attributes": attrNow({ options: [] }) } },
  // Google can't be read right now
  googleDown: { tasks: { ...BASE_TASKS }, now: { "m1.gbp.business_facts": null, "m1.gbp.hours_attributes": null, "m1.gbp.services_products": null, "m1.gbp.attributes": null } },
  // not verified: the profile check shows its card
  needsCode: { tasks: Object.fromEntries(Object.entries(BASE_TASKS).filter(([k]) => k !== "m1.gbp.verify")), verify: { ok: true, facts: { verified: false, name: "Acme Plumbing" }, verify: { available: true, options: [{ method: "SMS", code: true, label: "Text message" }] } },
    now: { "m1.gbp.business_facts": factsNow(), "m1.gbp.hours_attributes": hoursNow(), "m1.gbp.services_products": svcNow(), "m1.gbp.attributes": attrNow() } },
  // the duplicate-listing check hasn't found one listing yet: the steps that put something on the profile wait
  listingUnknown: { tasks: { ...BASE_TASKS, "m1.audit.gbp_duplicate": { status: "pending" } }, now: { "m1.gbp.business_facts": factsNow(), "m1.gbp.hours_attributes": hoursNow(), "m1.gbp.services_products": svcNow(), "m1.gbp.attributes": attrNow() } },
  // the five covered steps are already done and on Google
  allDone: { tasks: { ...BASE_TASKS,
    "m1.gbp.business_facts": done({ client_input: { name: "Acme Plumbing", phone: "5550101234", website: "https://acmeplumbing.test", come: "no" }, google_push: { state: "on_google", after: { name: "Acme Plumbing", phone: "5550101234", website: "https://acmeplumbing.test", come: false, area: ["Springfield, IL"], region: "US" } } }),
    "m1.gbp.hours_attributes": done({ client_input: { days: DAYS("08:00", "17:00", ["sat", "sun"]) }, google_push: { state: "on_google" } }),
    "m1.gbp.services_products": done({ client_input: ["drain", "water"], google_push: { state: "on_google", after: ["drain", "water"] } }),
    "m1.gbp.attributes": done({ client_input: ["women_led"], google_push: { state: "on_google" } }) },
    // what Google shows now for each finished step (a finished row reads it: client_step03_business_details_v1): the same values that went on
    now: { "m1.gbp.business_facts": factsNow(), "m1.gbp.services_products": svcNow(), "m1.gbp.hours_attributes": hoursNow(), "m1.gbp.attributes": attrNow({ ticked: ["women_led"] }) } },
};
// RGA's five cards, in the states the client sees them
export const RGA_CARD_TASKS = {
  "m1.strategy.keywords_locations": done({ outcome_data: { demand: [1, 2, 3, 4, 5].map((i) => ({ term: `plumber ${i}`, volume: 100 * i })), locations: [] } }),
  "m1.gbp.booking_link": done({ client_input: { value: "https://acmeplumbing.test/book", choice: "website" }, google_push: { state: "on_google" } }),
  "m1.brand.social_profiles": done({ client_input: { profiles: [{ key: "facebook", name: "Facebook", url: "https://facebook.com/acme" }, { key: "yelp", name: "Yelp", url: "https://yelp.com/biz/acme" }] } }),
  "m1.tracking.call_setup": done({ client_choice: "rga_sets_up" }),
  "m1.tracking.form_setup": done({ detected: { verdict: "confirmed", evidence: "3 form submissions recorded in the last 90 days" } }),
};
