/**
 * sendable.mjs — ONE definition of "this lead will actually get an email".
 *
 * ─── WHY (2026-08-26) ────────────────────────────────────────────────────────────────────────────
 * `check-send-queue-drained.mjs` — the gate that decides when the 2026-08-25 production pause ends —
 * re-implemented the queue as `Video URL + Email + no Email Sent Date`. That counted **425**.
 * `daily-action-report.mjs` already published the real figure: **184**.
 *
 * The 241-lead difference was not noise. It was:
 *
 *     229  suppressed
 *      29  bounced / invalid email
 *      16  draft already created
 *
 * **Suppressed and bounced leads never get a send date.** So the gate would have waited on ~258 leads
 * that can never send — keeping production paused FOREVER while reporting "still draining".
 *
 * > A restart condition that can never be satisfied is not a safety check. It is an outage.
 *
 * The rule below is the one the daily report has always used. It now lives in one place so the two
 * cannot drift again — the same failure as the contract generator holding its own copy of the prices
 * ([[project-call-close-and-contract-flow]]).
 *
 * A lead is SENDABLE when ALL hold:
 *   • not Suppressed                       — we decided not to contact them
 *   • has an Email                         — nothing to send to
 *   • Email Status is not terminal         — invalid/bounced addresses never deliver
 *   • has a Video URL                      — the email's whole point is the video
 *   • Status is 'new' (or blank)           — anything else is already in a funnel stage
 *   • no Draft Created                     — already queued in Gmail, not waiting on us
 *   • has not Replied                      — a reply moves them to a human, not a sequence
 */

/** Terminal email states — these addresses will never deliver, so they can never leave the queue. */
export const TERMINAL_EMAIL = /invalid|bounced|no-replacement|permanent|soft-bounced/i;

const fieldOf = (r, k) => (r && r.fields ? r.fields[k] : undefined);
const present = (r, k) => {
  const v = fieldOf(r, k);
  return v !== undefined && v !== null && v !== '' && v !== false;
};

/** True when this lead is genuinely waiting to be emailed. */
export function isSendable(record) {
  const status = String(fieldOf(record, 'Status') || 'new').toLowerCase();
  return (
    !fieldOf(record, 'Suppressed') &&
    present(record, 'Email') &&
    !TERMINAL_EMAIL.test(fieldOf(record, 'Email Status') || '') &&
    present(record, 'Video URL') &&
    (status === 'new' || status === '') &&
    !fieldOf(record, 'Draft Created') &&
    !present(record, 'Replied')
  );
}

/**
 * Why the rest of the video+email population is NOT sendable. Reported alongside the queue so a
 * shrinking number is never mistaken for progress when it is really suppression.
 */
export function queueBreakdown(records) {
  const withVideoAndEmail = records.filter((r) => present(r, 'Video URL') && present(r, 'Email'));
  const sent = withVideoAndEmail.filter((r) => present(r, 'Email Sent Date'));
  const unsent = withVideoAndEmail.filter((r) => !present(r, 'Email Sent Date'));
  return {
    total: withVideoAndEmail.length,
    sent: sent.length,
    sendable: records.filter(isSendable).length,
    draftCreated: unsent.filter((r) => fieldOf(r, 'Draft Created')).length,
    suppressed: unsent.filter((r) => fieldOf(r, 'Suppressed')).length,
    bounced: unsent.filter((r) => TERMINAL_EMAIL.test(fieldOf(r, 'Email Status') || '')).length,
  };
}
