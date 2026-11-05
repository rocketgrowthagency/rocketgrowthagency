// admin-stuck.mjs — a signed-in admin tab that is STILL loading after its wait, or whose render logged its own failure, is a broken tab
// (11-4 ~7:05–8:10 PM: the admin checklist drew nothing for every client; the panel said "Loading the playbook…" and the console
// "Flow render failed: ReferenceError", and a character count passed it). Used by check-admin-tabs-render; its mutations target this file.
export const STUCK = [[/Loading the playbook/i, 'still says "Loading the playbook…" after its wait'], [/Flow render failed/i, 'logged "Flow render failed"']];
export function stuckReason(panelText, logs) {
  for (const [re, why] of STUCK) if (re.test(panelText || "") || (logs || []).some((l) => re.test(l))) return why;
  return null;
}
