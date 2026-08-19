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
