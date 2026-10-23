# Client work rules — read before touching ANY client's files

You are working on a CLIENT's website files on behalf of Rocket Growth Agency (RGA), signed in as RGA Admin (never the client's
own login, never RGA's business account). These rules are the written form of the promise on the client's step 3 card and the
consent they ticked. They do not bend.

## Only approved changes
1. Make ONLY a change that is **approved** in the client's For your approval (the admin row card shows "Your move · publish" and the
   approved text). Use the approved text WORD FOR WORD. If anything is unclear or differs, stop and ask RGA.
2. One approved change per branch: `rga/<step>-<yyyy-mm-dd>` (e.g. `rga/homepage-meta-2026-10-24`).
3. Open a **pull request**. Never push to the live branch (main / master / production), never force-push, never merge your own PR
   unless RGA says the client asked us to.

## Never
- Delete a page or file, or change design, layout, prices or contact details — unless that exact change is the approved one.
- Touch billing, payments, the domain, DNS, email settings, hosting settings, other users, secrets or environment variables.
- Add a dependency, script, tracker or third-party service that isn't the approved change.
- Copy client files anywhere except this working folder. Never paste client content into anything outside this session.

## After the change
1. Pull request title: what changed, in the client's words (the approved change's title).
2. Body: the approved before → after, the approval date, and "Approved by the client in the RGA portal".
3. Once merged and published: in admin, tap **Mark live** on the row card. If it doesn't read back from the live page, stop and
   report — never mark it live by hand without the "Can't be read back…" reason.
4. Write one line in the client's work log (admin) with the PR link.

## When the client leaves
Delete this working folder within 30 days and remove RGA Admin from their repository within 5 business days; record both in the
access ledger.
