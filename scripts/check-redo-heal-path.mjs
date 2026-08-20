#!/usr/bin/env node
/**
 * check-redo-heal-path.mjs — static guard on the THREE things a flagged redo needs to actually heal.
 * Every one of them has silently broken before, and the symptom is identical each time: the redo queue
 * just never drains (0 of 10 healed on 2026-08-11) while everything reports success.
 *
 *   1. next-search must re-pick an armed redo's search        (feedback_redo_heal_requires_repickable_search)
 *   2. dedup must NOT blank an armed redo's email             (it matches ITSELF on the re-scrape)
 *   3. a gate block must still arm when the lead has no Airtable row yet (first-time builds)
 *
 * Usage: node scripts/check-redo-heal-path.mjs   Exit 0 = intact, 1 = the redo queue can't drain.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const CHECKS = [
  { name: 'next-search re-picks armed redos',
    ok: () => /redo-armed/.test(read('scripts/next-search.mjs')) && /redoPending/.test(read('scripts/next-search.mjs')),
    why: 'without it the search never re-runs, so the lead is never re-scraped' },
  { name: 'dedup index tracks armed redos',
    ok: () => /armedRedos/.test(read('lib/dedup-by-email.mjs')),
    why: 'the index must know which records are waiting to rebuild' },
  { name: 'dedup lets an armed redo through',
    ok: () => /armedRedos\?\.has\(matchedRecordId\)/.test(read('step-2-email-scraper.mjs')),
    why: 'a re-scraped redo matches ITSELF; blocking it blanks the email and step-3 skips the lead' },
  { name: 'gate blocks arm without an Airtable row',
    ok: () => /no Airtable row yet \(first-time build\)/.test(read('build-video-landing.mjs')),
    why: 'first-time builds have no lead row until step-8, so nothing was ever queued for retry' },

  // 🔴 2026-08-18 — THE FOUR CHECKS ABOVE ALL PASSED WHILE THE PATH WAS BROKEN.
  // Check 4 only asserts that the gate UN-LEDGERS. Un-ledgering is necessary but NOT sufficient:
  // next-search builds `done` from the ledger AND from every Airtable lead row carrying that Search
  // Term, so one deployed lead re-adds the search and the un-ledger is cancelled out. Measured on
  // "Yoga studios in Culver City, CA" — ledger line gone, done.has(term) still true from the 5
  // deployed rows, the 4 failed leads unreachable. The gate reported 4/4 the whole time: a check that
  // cannot observe the outcome it is guarding reads as a pass ([[feedback-dead-check-selector-gap]]).
  { name: 'un-ledger is paired with the pending-rebuild override',
    ok: () => /pending-rebuild-searches/.test(read('scripts/next-search.mjs'))
           && /done\.delete/.test(read('scripts/next-search.mjs'))
           && /pending-rebuild-searches/.test(read('scripts/overnight-pipeline.sh')),
    why: 'un-ledgering alone is cancelled by any deployed lead in the same search; without the override file the pre-step-8 losses (6/6 gate, watchdog, step-3 WebM count) are unreachable forever' },

  { name: 'the pending-rebuild queue self-clears',
    ok: () => /PENDING_REBUILD_FILE/.test(read('scripts/overnight-pipeline.sh'))
           && /Self-clear the rebuild queue/.test(read('scripts/overnight-pipeline.sh')),
    why: 'a permanent queue entry re-picks the same category every night forever (cost: 17 re-runs / ~13h on Painters)' },

  { name: 'pre-step-8 loss paths re-arm',
    ok: () => {
      const s = read('scripts/overnight-pipeline.sh');
      // All three must call the helper, or that path silently loses its leads with no way back.
      return /unledger_search_for_redo "\$BIZ_NAME" "below 6\/6"/.test(s)
          && /unledger_search_for_redo "\$biz" "watchdog-timeout"/.test(s)
          && /unledger_search_for_redo "\$BIZ_NAME" "step-3 incomplete/.test(s);
    },
    why: 'the 6/6 gate, the watchdog and the step-3 WebM check all kill the lead BEFORE step-8 writes its Airtable row, so reconcile-missing-videos.mjs can never see it' },

  // 🔴 2026-08-18 — THE REDO MACHINE ALMOST SENT THREE BROKEN VIDEOS.
  // FINALIZE was `isArmed && url`: it inferred "successfully re-rendered" from a Video URL merely
  // EXISTING. armRedoAfterGateFail() wrote `redo-armed (attempt N): <failure>` without clearing the
  // URL, so a lead whose video had just been REJECTED looked identical to one that passed. A DRY run
  // found Terra Towing, Santa Monica Auto Body and Mar Vista Detail all queued to be un-suppressed.
  // Un-suppressing is effectively irreversible — the email goes out — so it must fail CLOSED.
  { name: 'FINALIZE refuses a gate-failure re-arm',
    ok: () => {
      const s = read('scripts/redo-flagged-videos.mjs');
      return /isGateFailArm/.test(s) && /REFUSING to finalize/.test(s);
    },
    why: 'without it, a lead re-armed by a FAILED gate is read as "re-rendered" and un-suppressed — broken videos go to prospects' },

  { name: 'a gate re-arm clears the send signal',
    ok: () => {
      const s = read('build-video-landing.mjs');
      // Both branches (retry and permafail) must blank Video URL + Vid Slug.
      const arm = s.slice(s.indexOf('const fields = giveUp'), s.indexOf('if (!giveUp) unLedgerSearch'));
      return (arm.match(/"Video URL":\s*""/g) || []).length >= 2 && (arm.match(/"Vid Slug":\s*""/g) || []).length >= 2;
    },
    why: 'outreach sends on Email + Video URL + !Suppressed; leaving the URL on a gate-failed lead makes Suppressed the only thing protecting the prospect' },

  { name: 'a passing rebuild closes out its own redo',
    ok: () => /redo closed out for/.test(read('build-video-landing.mjs')),
    why: 'if success never clears the redo-armed marker, the stricter FINALIZE can never fire and fixed videos stay suppressed forever — the opposite silent failure' },

  // 🔴 2026-08-19 — A RE-ARM MUST DEFER TO THE NEXT RUN, NOT RE-PICK NOW.
  // overnight-local.sh records each search in attempted-searches.log BEFORE running it — the guard added
  // after "Painters" span 17 times / ~13h. unledger_search_for_redo() DELETES that record whenever a lead
  // fails, erasing the guard mid-run, so next-search handed the same category straight back.
  // Measured 2026-08-18: "Yoga studios" took slots 1, 2, 3 and 4 of 5; only the per-lead cap stopped it,
  // and the night's backlog drain never happened. Retrying a lead inside the same batch also contradicts
  // feedback_capture_instability_in_long_batches (retry COLD).
  { name: 'a mid-run re-arm cannot re-pick the same search',
    ok: () => {
      const ns = read('scripts/next-search.mjs'), ol = read('scripts/overnight-local.sh');
      return /attempted-this-run/.test(ns) && /attempted-this-run/.test(ol)
          && /thisRun\.has/.test(ns)            // the queue is filtered by it
          && /: > "\$SCRAPER_DIR\/output\/attempted-this-run\.txt"/.test(ol); // and it is cleared per run
    },
    why: 'without the run-scoped lock a failing lead re-queues its own search and the run re-picks it immediately, burning the night on one category' },

  // 2026-08-19 — the loop must CLOSE: round 2 has to see the leads round 1 armed, and parked leads must
  // get another chance when the code that rejected them changes. Both were silently absent.
  { name: 'round 2 can see armed redos',
    ok: () => /isArmedRedo/.test(read('scripts/reconcile-missing-videos.mjs')),
    why: 'ARM sets Suppressed=true, so a !Suppressed-only gap filter hides exactly the leads the recovery pass exists to retry — the self-heal loop never closes' },

  { name: 'parole retries leads parked before a capture fix',
    ok: () => {
      const p = read('scripts/parole-permafails.mjs'), ol = read('scripts/overnight-local.sh');
      return /captureEpoch/.test(p) && /parole-epoch/.test(p) && /parole-permafails/.test(ol);
    },
    why: 'without it a lead parked by a gate bug we later FIXED stays dead forever (48 of 75 rejections were false)' },

  { name: 'the verdict trusts armed state over historical text',
    ok: () => {
      const v = read('scripts/overnight-verdict.mjs');
      return /!selfHealing\(r\) && parkedNow\(r\)/.test(v);
    },
    why: 'Skip Reasons keeps history ("was: video-unrenderable-3x"); matching it as current state reports freshly-paroled leads as still stuck' },

  // 2026-08-19 — a systemic break must STOP the run, not burn every lead's 3-attempt cap.
  { name: 'circuit breaker stops a collapsed run',
    ok: () => {
      const ol = read('scripts/overnight-local.sh');
      // Must call it AND read PIPESTATUS[0] — `if ! node … | tee` tests tee (always 0) and the breaker
      // would be silently dead, which is how it was first written.
      return /run-health-check\.mjs/.test(ol)
          && /run-health-check\.mjs[^\n]*\n\s*if \[ "\$\{PIPESTATUS\[0\]\}" -ne 0 \]/.test(ol);
    },
    why: 'without it a Chrome/Maps change fails every lead, burns all 3 attempts each and parks dozens of good leads; reading the pipeline status instead of PIPESTATUS[0] makes the breaker a no-op' },

  // 2026-08-19 — lead selection must reject addresses that cannot reach the business, AND the suite that
  // proves it must actually run. Both were absent: junkContactReason existed but nothing asserted it was
  // wired into isLikelyEmail, and email-validation.test.cjs was never invoked by the pipeline.
  { name: 'unreachable contacts rejected at scrape time',
    ok: () => {
      const v = read('lib/email-validation.cjs');
      // Defined AND actually hooked into the central gate — a helper nobody calls is dead code.
      return /function junkContactReason/.test(v) && /if \(junkContactReason\(trimmed\)\) return '';/.test(v);
    },
    why: 'telemetry/hex/directory addresses enter the pipeline and burn a full ~6-min capture each before being refused downstream' },

  { name: 'the email-validation suite runs pre-flight',
    ok: () => /email-validation\.test\.cjs/.test(read('scripts/overnight-pipeline.sh')),
    why: 'isLikelyEmail decides which leads enter the run; without the suite in pre-flight a regression is silent — too strict silently DROPS REAL PROSPECTS' },

  // 2026-08-19 — rebuild-broken-videos.sh had NO per-lead bound while overnight-pipeline.sh has had one
  // for months. Capture is a SILENT phase (~5 min, no output), so a hang looks exactly like progress and
  // would take the whole batch with it. Must NOT use `timeout`: that is GNU coreutils and is absent on
  // stock macOS, which would make the guard a silent no-op.
  { name: 'rebuild script bounds each capture',
    ok: () => {
      const s2 = read('scripts/rebuild-broken-videos.sh');
      return /STEP3_TIMEOUT_SEC/.test(s2)
          && /kill -0 "\$S3PID"/.test(s2)                    // a real poll loop, not `timeout`
          && !/\btimeout -k\b/.test(s2)                      // and never the coreutils binary
          && /chrome-profile-step3/.test(s2);                // Chrome reaped, else it wedges the next lead
    },
    why: 'an unbounded capture hang stalls the entire rebuild batch forever, and `timeout` is not available on macOS so it cannot be used as the bound' },

  // 2026-08-19 — SELF-HEALING ROUNDS over the historical backlog. 252 leads failed on earlier nights and
  // NOTHING could see them: most died before step-8 so they have no Airtable row, leaving reconcile and
  // parole both blind. Their only record is the overnight report.
  { name: 'recovery rounds work the historical backlog',
    ok: () => {
      const rr = read('scripts/recovery-rounds.sh'), ol = read('scripts/overnight-local.sh');
      return /recovery-rounds\.sh/.test(ol)                 // actually invoked by the nightly run
          && /recover-lost-leads\.mjs --json/.test(rr)      // driven by report history, not Airtable
          && /RECOVERY_ATTEMPT_CAP|CAP=/.test(rr);          // and a lead cannot be retried forever
    },
    why: 'without it the historical failed-video backlog is invisible to every other recovery route and nothing ever rebuilds it' },

  { name: 'recovery rounds are bounded by clock AND night window',
    ok: () => {
      const rr = read('scripts/recovery-rounds.sh');
      return /DEADLINE/.test(rr)
          && /-ge 7 \] && \[ "\$NH" -lt 21/.test(rr)        // must stop before the workday
          && /STOP-OVERNIGHT/.test(rr);
    },
    why: 'unbounded rounds would capture into the workday and film the desktop, or run past the night entirely' },

  // 2026-08-19 — the RECOVERY path needs its own breaker. overnight-pipeline.sh got one this morning, but
  // the backlog path is where it matters MOST: every lead there has only RECOVERY_ATTEMPT_CAP tries before
  // being parked forever, so grinding on a bad day spends the whole queue's budget at a rate that cannot
  // succeed. Measured: a chunk went 0 staged / 5 leads, 4 BLANK-PHOTOS, on a day when night runs on the
  // same code have ranged 0%-90% for that failure.
  { name: 'recovery rounds stop on a dead chunk',
    ok: () => {
      const rr = read('scripts/recovery-rounds.sh');
      return /RECOVERY CIRCUIT BREAKER/.test(rr)
          && /CH_STAGED/.test(rr)
          && /Refunded 1 attempt/.test(rr);   // a doomed chunk must not consume the leads' budget
    },
    why: 'without it a bad photo-loading day burns one of three attempts on every lead in the backlog and parks them permanently' },

  // 2026-08-19 — the vision model is asked `photos_visible` and answers FALSE for two different things:
  // a GBP with no photo strip (fine) and a strip that failed to render (a defect). It cannot separate
  // them; hero-band.mjs can (a failed load is a WHITE VOID, Google's honest no-photos state is a coloured
  // placeholder). Measured on dr-augusto-rojas-md: deterministic ACCEPT + a visibly complete card +
  // photoCount=2, yet three cold rebuilds were spent on it.
  { name: 'vision model cannot override the deterministic hero band',
    ok: () => {
      const cv = read('scripts/check-video-visual.mjs');
      return /heroDeterministicOk/.test(cv)
          && /blankPhotosRaw && !heroDeterministicOk/.test(cv)      // conditional, not removed
          && /catch \(_\) \{ heroDeterministicOk = false; \}/.test(cv);  // unavailable -> stay STRICT
    },
    why: 'without this the probabilistic check false-rejects videos the deterministic band already passed, burning a full capture each time' },

  // 2026-08-19 — a lead whose OWN site cannot be loaded by any client can never produce 3/3 WebMs, so
  // every retry burns ~6 min and one of its three lifetime attempts. davidostrovelaw.com fails Chrome AND
  // curl (sslv3 handshake) and had already failed twice. Only HARD failures park a lead; a timeout/403/
  // bot-block is transient and still gets its capture.
  { name: 'unreachable sites are parked, not re-captured',
    ok: () => {
      const rb = read('scripts/rebuild-broken-videos.sh');
      return /check-site-reachable\.mjs/.test(rb)
          && /site-unreachable/.test(rb)
          && /unbuildable-leads\.tsv/.test(rb);   // and it is RECORDED, not silently dropped
    },
    why: 'a permanently unreachable site is retried forever, wasting a full capture and an attempt each time' },

  // 2026-08-19 (Chris: "if it fails close the browser of the failed" + "list the reason ... so we can
  // tally fail reasons"). A failed lead used to leave its Chrome parked on the site's own error page; the
  // windows pile up AND an orphaned Chrome keeps its profile dir locked, wedging the next lead (the
  // 2026-07-27 stall). Reasons lived only in prose in the log, so they could not be counted.
  { name: 'failures reap Chrome and are logged by reason',
    ok: () => {
      const rb = read('scripts/rebuild-broken-videos.sh');
      const paths = (rb.match(/FAILED\+=\(/g) || []).length;
      const reaps = (rb.match(/reap_chrome;/g) || []).length;
      const notes = (rb.match(/note_fail /g) || []).length;
      // every failure path must both reap and record — a partially-covered set is how orphans return
      return /reap_chrome\(\)/.test(rb) && /rebuild-failures\.tsv/.test(rb)
          && reaps >= paths && notes >= paths;
    },
    why: 'an orphaned Chrome locks its profile dir and wedges the NEXT lead; unlogged reasons cannot be tallied' },

  // 2026-08-19 — TWO failures found by watching a live run, not by reading code:
  //  (a) the breaker used `grep -c ... || echo 0`, which on ZERO matches yields "0\n0" (grep prints 0 AND
  //      exits 1, so the fallback also fires) — the numeric test throws and the breaker SILENTLY SKIPS.
  //      Round 1 built 0 of 6 and nothing stopped; round 2 re-ran the same six leads.
  //  (b) parked leads were still selected every round, so two proven-dead sites were re-captured at
  //      ~6 min each.
  { name: 'recovery counters cannot yield "0\\n0"',
    ok: () => {
      const rr = read('scripts/recovery-rounds.sh');
      return /CH_STAGED=\$\(awk /.test(rr) && !/grep -c '✓ staged'[^\n]*\|\| echo 0/.test(rr);
    },
    why: 'grep -c prints 0 AND exits 1 on no matches, so `|| echo 0` appends a second 0 and the breaker never fires' },

  { name: 'parked unbuildable leads are never re-selected',
    ok: () => {
      const rr = read('scripts/recovery-rounds.sh');
      return /unbuildable-leads\.tsv/.test(rr) && /is_unbuildable/.test(rr);
    },
    why: 'without the skip-list the same permanently dead sites are picked every round, ~6 min each' },

  // 2026-08-19 deep audit — three latent bugs, all the SAME SHAPE as the `grep -c || echo 0` one:
  // a missing/invalid input yields EMPTY, the numeric or string test then throws, and the guard fails
  // in the dangerous direction. Found by tabulating inputs, not by re-reading the code.
  { name: 'recovery guards survive missing/invalid inputs',
    ok: () => {
      const rr = read('scripts/recovery-rounds.sh'), cs = read('scripts/check-site-reachable.mjs');
      return /echo "\$\{n:-0\}"/.test(rr)                       // attempts_for always prints a number
          && /NH" -ge 20 \] \|\| \[ "\$NH" -lt 7/.test(rr)      // daytime window closed at BOTH ends
          && /state: 'invalid-url'/.test(cs);                   // malformed URL never parks a lead
    },
    why: 'a missing ledger made every lead skip silently; a bad CSV URL would park a good lead forever; a daytime chain could start at 05:00 and fight the night run for Chrome' },

  // 2026-08-19 — KILLING A WRAPPER DOES NOT KILL THE LOOP IT SPAWNED. I killed `away-chain` and reported
  // "0 running"; recovery-rounds.sh was a CHILD that kept looping and launched a fresh batch minutes
  // later, so Chris watched Chrome keep popping up while being told nothing was running.
  { name: 'a single stop script kills every capture layer',
    ok: () => {
      const st = read('scripts/stop-all-capture.sh');
      // Assert the KILL LIST itself, not merely that the word appears somewhere — the script also
      // names these in comments and in its verification list, so a loose match passed while the kill
      // loop had lost `recovery-rounds`. Same "count the call sites, not the mentions" lesson.
      const killLoops = (st.match(/^for p in ([^;]+); do\s*\n\s*pkill -9 -f "\$p"/m) || [])[1] || '';
      return /recovery-rounds/.test(killLoops)       // the loop that survived on 2026-08-19
          && /away-chain/.test(killLoops)
          && /rebuild-broken-videos/.test(st) && /step-3-video-recorder/.test(st)
          && /chrome-profile-step/.test(st)          // capture Chrome ONLY
          // Strip comments BEFORE asserting the negative: the script's own warning line contains the
          // very string we forbid, so matching raw text made this check fail from birth (3rd time today
          // I have written a born-red gate — see feedback_empty_output_breaks_the_test).
          && !/pkill[^\n]*'Google Chrome'/.test(st.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n'))
          && /verification/.test(st);                // and it VERIFIES rather than trusting the kill
    },
    why: 'killing the wrapper leaves the loop alive to relaunch a batch, and an unverified stop reports success while captures continue' },

  // 2026-08-20 — A NIGHT RUN CROSSES MIDNIGHT. overnight-local.sh stamps DATE_STAMP once at 21:00 but
  // overnight-pipeline.sh re-stamps it per search, so post-00:00 searches write accumulators under the
  // NEXT day. The breaker read only the start date and stopped seeing new work at midnight: its view
  // froze at 38/54 while the night actually built 71/112. Had the later searches failed at 0% it would
  // still have reported "above the floor" from stale data.
  { name: 'the breaker sees work on both sides of midnight',
    ok: () => {
      const h = read('scripts/run-health-check.mjs');
      return /nextDay/.test(h) && /DATES\.some/.test(h);
    },
    why: 'a run that crosses midnight splits its accumulators across two dates; reading one date makes the breaker judge a stale, partial night' },

  // 2026-08-20 — the verdict read ONLY Airtable lead state, so a night halted by an empty OpenAI account
  // still printed "✅ Nothing needs you". A blocker never self-heals; it must land in the NEEDS-YOU line.
  { name: 'the verdict surfaces run-level blockers, not just lead state',
    ok: () => { const v = read('scripts/overnight-verdict.mjs');
      return /BLOCKERS\s*=/.test(v) && /OUT OF CREDITS/i.test(v) && /RUN BLOCKER/.test(v); },
    why: 'a run halted by an out-of-funds account would report "nothing needs you" while nothing could heal' },

  // 2026-08-20 — and the recovery loop must STOP on that blocker rather than re-running a check that
  // cannot pass until a human acts. It would otherwise spin from 04:00 to the 07:00 deadline.
  { name: 'recovery rounds stop on an unrecoverable blocker',
    ok: () => { const r = read('scripts/recovery-rounds.sh');
      return /UNRECOVERABLE BLOCKER/.test(r) && /FATAL: OpenAI OUT OF CREDITS/.test(r); },
    why: 'retrying only makes sense when the next attempt could differ; an empty account is not that' },

  // 2026-08-20 — stop-all-capture.sh deleted "$(date)*" from output/Step 2, which included the MASTER
  // scraped CSV, not just per-lead temps. A run crossing midnight makes "today" its own output date, so
  // stopping at 04:18 destroyed the night's own inputs and made two credit-killed leads unrebuildable.
  { name: 'the stop script deletes only per-lead temp CSVs, never the master',
    ok: () => { const t = read('scripts/stop-all-capture.sh');
      return /-only-\*/.test(t) && !/-name "\$\(date \+%Y-%m-%d\)\*" -delete/.test(t); },
    why: 'deleting the master step-2 CSV makes every lead in that search permanently unrebuildable' },

  // 2026-08-20 — every pre-flight FATAL gate tested tee's exit code instead of the check's.
  // `if ! node check.mjs 2>&1 | tee -a "$LOG"` takes $? from the LAST command in the pipeline (tee,
  // which always succeeds), so all 24 gates printed their result and could never abort the run.
  { name: 'pre-flight gates read the check exit code, not tee',
    ok: () => { const t = read('scripts/overnight-pipeline.sh');
      return !/if ! (node|bash|python3?) [^\n]*\| tee -a "\$LOGFILE"; then/.test(t)
        && /_grc=\$\{PIPESTATUS\[0\]\}/.test(t); },
    why: '24 FATAL gates could never fire; a failing check read as a pass' },

  // 2026-08-20 — the deploy swallowed its own failure the same way, plus `|| true`.
  { name: 'the netlify deploy failure is fatal, not swallowed',
    ok: () => { const t = read('scripts/overnight-pipeline.sh');
      return !/netlify deploy --prod --dir=\. 2>&1 \| tee -a "\$LOGFILE" \| grep -E "[^"]*" \|\| true/.test(t)
        && /_drc=\$\{PIPESTATUS\[0\]\}/.test(t) && /DEPLOY FAILED/.test(t); },
    why: 'Netlify ran out of credits and 53 of 71 landing pages silently served the homepage' },

  // 2026-08-20 — the Maps highlight regressed to black because a stylesheet !important beat our
  // plain inline style; a positive outline-offset also let the ring be clipped.
  { name: 'the Maps card highlight is !important and inset',
    ok: () => { const t = read('step-3-video-recorder.mjs');
      return /setProperty\('outline-color', '#2f57eb', 'important'\)/.test(t)
        && /setProperty\('outline-width', '4px', 'important'\)/.test(t)
        && /setProperty\('outline-offset', '-\d+px', 'important'\)/.test(t)
        && /setProperty\('transition', 'none', 'important'\)/.test(t); },
    why: 'an animating outline is captured mid-fade as a BLACK 0px ring (measured on a live Maps card); a positive offset gets clipped' },

  // 2026-08-20 — a lead must never stay emailable while its video page serves the SPA homepage.
  { name: 'leads without a live video are held before sending',
    ok: () => { const t = read('scripts/overnight-pipeline.sh');
      const g = read('scripts/hold-leads-without-live-video.mjs');
      return /hold-leads-without-live-video\.mjs --apply/.test(t)
        && /video\/mp4/.test(g) && /closed_/.test(g); },
    why: '53 leads stayed sendable with dead pages and 5 prospects were emailed a homepage link' },

  // 2026-08-20 — the Maps detail card recorded SEE-THROUGH (Chris caught it on Dr. Augusto Rojas:
  // coastline and map labels visible through the white panel). The only wait was "does the h1 exist",
  // which Maps satisfies the instant the panel starts rendering — so the recorded hold began mid-fade.
  { name: 'the detail panel is opaque before the recording hold',
    ok: () => { const t = read('step-3-video-recorder.mjs');
      return /async function settleDetailPanel/.test(t)
        && /await settleDetailPanel\(page\)/.test(t)
        && /transition-duration: 0s !important/.test(t)
        && /parentElement/.test(t); },
    why: 'an h1-exists wait does not mean the card finished animating; a translucent ANCESTOR makes it see-through' },

  // 2026-08-20 — reconciliation only ever ran leads → videos, so a video with NO lead was invisible.
  // Digital Imaging Center was live and 6/6-verified with no Airtable record; the orphan sweep then
  // found 27 more built in the previous 14 days. Reported nightly, never fatal.
  { name: 'orphaned videos (no lead behind them) are reconciled nightly',
    ok: () => { const t = read('scripts/overnight-local.sh');
      const g = read('scripts/check-orphan-videos.mjs');
      return /check-orphan-videos\.mjs/.test(t) && /ORPHAN_FAIL_DAYS/.test(g); },
    why: 'a full build that can never produce an email is silent — every other check starts from the lead list' },

  { name: 're-arming is capped',
    ok: () => /MAX_UNLEDGER_REDOS/.test(read('scripts/overnight-pipeline.sh'))
           && /exhausted after/.test(read('scripts/overnight-pipeline.sh')),
    why: 'an always-failing lead would re-arm forever and pin the pipeline to one category, eating the nightly capacity' },
];

let bad = 0;
for (const c of CHECKS) {
  let pass = false;
  try { pass = !!c.ok(); } catch { pass = false; }
  if (pass) console.log(`  ✓ ${c.name}`);
  else { console.error(`  ✗ ${c.name} — ${c.why}`); bad++; }
}
if (bad) {
  console.error(`\n❌ ${bad} break(s) in the redo heal path — flagged videos will never rebuild.`);
  process.exit(1);
}
console.log(`\n✅ redo heal path intact (${CHECKS.length}/${CHECKS.length}).`);
