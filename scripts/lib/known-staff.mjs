// The staff sign-ins RGA knows about (check-the-staff-list-is-known). A staff account sees every client's data: adding one here is a decision.
export const KNOWN = {
  "hello@rocketgrowthagency.com": { role: "owner", why: "Chris, RGA's owner" },
  "rocketgrowthagencyadmin+robot@gmail.com": { role: "staff", why: "the checks' robot (scripts/create-robot-staff.mjs, 11-13)", factors: 1 },
};
