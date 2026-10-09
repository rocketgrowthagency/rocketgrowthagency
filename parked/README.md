# Parked playbook work — LIFTED 2026-10-08 (v7 is live in admin)

Chris, 2026-10-02: "we wont update admin until later. so we dont interfere with the other chat thats
doing alot of work with live site" · "just updating the PDF for now. then at end of session ill let
you know when to update all on admin so have all notes ready".

## How PDF-only updates work while this is parked
- `parked/playbook.js` is the DRAFT playbook. Edit THIS file, never `admin/playbook.js`.
- `node scripts/build-playbook-pdf.mjs --draft` prints it to the Desktop as the next version number
  ("RGA Sales Playbook - v7 - <date>.pdf"). The website repo, admin, admin Docs and the version archive
  are not touched, so another session's deploy cannot ship it.
- Expected while parked: check-playbook-integrity reports `printed-playbook-desktop-stale`, because the
  Desktop has the draft and the repo has v6. That is known and fine.

## Changes waiting for admin
(none — all five went live as v7 on 2026-10-08, when Chris approved "playbook v7 into the admin".
PDF-only mode is LIFTED: edit admin/playbook.js directly and follow project_sales_playbook's update steps.)

## When Chris says "update admin" (do ALL of this, in order)
1. Check the Website repo is calm: `git status`. Another session's uncommitted files are fine, because
   deploy-site.sh ships only commits.
2. `cp parked/playbook.js "<Website>/admin/playbook.js"`, then compare it against the live v6 to be sure only
   the listed changes moved: `git diff admin/playbook.js`.
3. Bump `playbook.js?v=` in admin/index.html (and admin.css?v= only if CSS changed).
4. `node scripts/build-playbook-pdf.mjs --note="<the list above, short>"` (NOT --draft). This archives the
   new version, writes the receipt, updates admin Docs, and replaces the Desktop copy.
5. Gates: check-playbook-integrity (only the pre-deploy cache-buster line may show), check-playbook-renders,
   check-browser-js-parses-as-the-browser-does.
6. Commit both repos, `bash scripts/deploy-site.sh "..."`, then verify the live playbook.js by CONTENT.
7. Empty the "Changes waiting" list above and delete parked/playbook.js + parked/sales-playbook-draft.pdf.
