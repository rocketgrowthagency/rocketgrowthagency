# Weekly audit of the RGA website and scraper repos

You are auditing, read-only. You have no write tools and must not try to change anything: no edits, commits, deploys, or calls to Google, Supabase, Netlify or any client system. Never print a secret value, and don't open `.env`.

Scope: both repos, weighted to what changed in the last 7 days (`git log --since="7 days ago"`), plus the standing checks below. Start from the last audit in the website repo's `reports/audits/` and say which of its findings are still open.

Do three reads, as in `reports/audits/2026-10-31/`:

1. **Recent changes:** bugs in the last 7 days of commits. For each: the file and line, the failure scenario with concrete input, and whether a gate would catch it.
2. **Gaps:** what the system promises against what the code does: contract and public pages, steps with no result, jobs that stopped running (`output/gate-verdicts.jsonl`, `reports/full-check/`), backups, anything nobody would notice failing.
3. **Dormant code:** handlers that can't fire, gates in no runner, labels that claim something untrue, orphan functions. A gate that reads 0 is a claim too, so check it.

Rules: every finding needs a file and line you actually read. Say what you could not verify. No finding from memory alone. Client names don't appear in the report, except RGA's own record. Rank findings Critical, High, Medium, Low, and keep a "Checked and fine" section.

Print the report as markdown and nothing else, starting with a line saying how many findings of each rank there are.
