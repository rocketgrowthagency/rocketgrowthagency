# Parked work — NOT deployed on purpose

## Sales playbook v7 (2026-10-02) — waiting until the admin/live-site work in the other chat settles

Chris: "we wont update admin until later. so we dont interfere with the other chat thats doing alot
of work with live site."

What v7 is: the 30-second line gets its own marked heading — "⏱ 30-SECOND VERSION — they don't
remember the video, or they're vague" — in We call them §1 and The call beat 1, and every mention
points at that label. Chris has the v7 PDF on his Desktop to review.

Files here:
- `playbook-v7-admin.patch` — admin/playbook.js + the playbook.js?v= bump in admin/index.html
- `sales-playbook-v7-2026-10-02.pdf` — the printed v7
- `versions-v7.json` — the version manifest including v7

To ship it later (Website repo):
1. `git apply "../Rocket Growth Agency Scraper VS Code/parked/playbook-v7-admin.patch"`
   (if the ?v= number moved, bump playbook.js?v= by hand instead)
2. `node scripts/build-playbook-pdf.mjs --note="30-SECOND VERSION marked with its own heading"` in this
   repo. It reprints, archives v7, and refreshes the Desktop. Do not copy the parked PDF in by hand.
3. Gates green, commit, deploy with deploy-site.sh, verify by content, then delete this folder's v7 files.

Expected while parked: check-playbook-integrity reports printed-playbook-desktop-stale, because the
Desktop has v7 and the repo has v6. That one is known and fine until v7 ships.
