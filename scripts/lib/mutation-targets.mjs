// mutation-targets.mjs — WHERE EACH MUTATION SUITE'S TARGET KEY POINTS. One map, imported by run-mutations.mjs (which
// applies the mutations) and check-every-mutation-still-applies.mjs (which checks every anchor still matches daily).
// A key → a path in the website repo, or "scraper:<path>" in this repo, or null (the gate itself is the target).
export const FILES = {
  bookkickofffn: "netlify/functions/portal-book-kickoff.js",   // final review 10-20
  clientfeed: "netlify/functions/_client-feed.js",   // final review 10-20
  portalfeedfn: "netlify/functions/portal-feed.js",   // final review 10-20
  gbpservices: "netlify/functions/_gbp-services.js",   // final review 10-20
  planokfn: "netlify/functions/portal-plan-ok.js",   // final review 10-20
  calltestfn: "netlify/functions/admin-call-test.js",   // final review 10-20
  cadencefn: "netlify/functions/portal-review-cadence.js",   // final review 10-20
  sopm1: "scraper:flow/playbooks/month1.mjs",   // canonical Month-1 SOP (final review R1, 10-20)
  sopm2: "scraper:flow/playbooks/month2plus.mjs",
  loginjs: "portal/client-login.js",
  cronskiplib: "scraper:scripts/lib/crons-skip-test-clients.mjs",
  scraper_metrics: "netlify/functions/metrics-daily-refresh.js",
  notifystepopen: "netlify/functions/notify-step-open.js",
  rankingsrefresh: "netlify/functions/rankings-refresh.js",
  statuspage: "netlify/functions/_status-page.js",
  portalindex: "portal/index.html",
  loginhtml: "client-login/index.html",
  admin: "admin/admin.js",
  exec: "netlify/functions/flow-execute.js",
  css: "admin/admin.css",
  portal: "portal/portal.js",
  playbook: "data/playbooks/playbooks.json",
  citdirs: "netlify/functions/_citation-directories.js",
  secondlogoshared: "shared/photo-second-logo.js",   // client_step10_photo_truth_v1
  backupdata: "scraper:scripts/backup-client-data.mjs",   // rga_data_backup_plan_v1
  backuplacie: "scraper:scripts/backup-lacie.sh",   // Chris 10-31: chats + repos on the Mac and LaCie
  recheck: "netlify/functions/portal-step-recheck.js",
  stepsql: "docs/supabase/RGA_CLIENT_STEP_RUNS_2026-10-07.sql",
  heavy: "netlify/functions/flow-execute-heavy-background.js",
  ghguardpy: "scripts/gh-account-guard.py",
  // 🔑 A LIVE-RENDER GATE READS PRODUCTION FOR ITS "GOT" SIDE, so the only input a mutation can
  // reach is the mockup it compares against. Mutating it proves the diff can fail; it cannot prove
  // the gate would notice an undeployed CSS edit, and nothing should claim it does.
  mockup: "reports/mockups/admin_every_run_is_kept_v1.html",
  mockupdet: "reports/mockups/admin_detected_step_v1.html",
  mockupdlv: "reports/mockups/admin_shot_list_deliverable_v2.html",
  draftshape: "netlify/functions/_draft-shape.js",
  gbpparent: "netlify/functions/_gbp-parent.js",
  v2gbpprofile: "netlify/functions/v2-gbp-profile.js",   // was a second "gbpprofile" key, silently overridden by _gbp-profile.js below
  recheckfn: "netlify/functions/portal-step-recheck.js",
  detsql: "docs/supabase/RGA_CLIENT_STEP_DETECTIONS_2026-10-07.sql",
  usidiom: "netlify/functions/_us-idiom.js",
  photopublish: "netlify/functions/_photo-publish.js",
  photopush: "netlify/functions/photos-push-to-gbp.js",
  photosweep: "netlify/functions/photos-publish-sweep.js",
  toml: "netlify.toml",
  photosql: "docs/supabase/RGA_CLIENT_PHOTO_PUBLISHES_2026-10-08.sql",
  sendstep: "netlify/functions/send-step-email.js",
  kickinvite: "netlify/functions/send-kickoff-invite.js",
  cancelinvite: "netlify/functions/cancel-kickoff-invite.js",
  payintent: "netlify/functions/portal-payment-intent.js",
  privacy: "privacy/index.html",
  invoiceemail: "netlify/functions/send-invoice-email.js",
  recplan: "netlify/functions/build-recommendations-plan.js",
  playbookjson: "data/playbooks/playbooks.json",
  adminpb: "admin/playbook.js",
  oauthcb: "netlify/functions/oauth-google-callback.js",
  balance: "netlify/functions/admin-send-balance-invoice.js",
  invoicedoc: "shared/invoice-doc.js",
  contractgen: "netlify/functions/contract-generate.js",
  stripewebhook: "netlify/functions/stripe-webhook.js",
  admincss: "admin/admin.css",
  notifystage: "netlify/functions/notify-client-stage.js",
  confirmemail: "netlify/functions/send-confirmation-email.js",
  portalcss: "portal/portal.css",
  kickreqs: "netlify/functions/kickoff-requests.js",
  mockupwait: "reports/mockups/step31_waiting_on_client_v1.html",
  thread: "netlify/functions/portal-thread.js",
  steplater: "netlify/functions/portal-step-later.js",
  reviewmetrics: "netlify/functions/refresh-review-metrics.js",
  photoreview: "netlify/functions/admin-photo-review.js",
  photoexamples: "shared/photo-examples.js",
  recapfn: "netlify/functions/send-kickoff-recap.js",
  calllive: "netlify/functions/kickoff-call-live.js",
  reportbg: "netlify/functions/report-build-background.js",
  reportview: "netlify/functions/fga-report-view.js",
  outcomefn: "netlify/functions/kickoff-call-outcome.js",
  reviewsql: "docs/supabase/RGA_CLIENT_PHOTO_REVIEW_2026-10-09.sql",
  letter: "shared/letter.js",   // 10-29: the code moved here (_letter.js re-exports it; admin previews with it)
  photolists: "netlify/functions/_photo-lists.js",
  phototeam: "netlify/functions/portal-photo-team.js",
  playbooksjson: "data/playbooks/playbooks.json",
  clientstepsjson: "data/playbooks/client-steps.json",
  photomatch: "netlify/functions/photo-match.js",
  photofp: "netlify/functions/_photo-fingerprint.js",
  onelisting: "netlify/functions/_one-listing.js",
  clientwaits: "netlify/functions/_client-waits.js",
  stepwaitsfn: "netlify/functions/portal-step-waits.js",
  confirmemailfn: "netlify/functions/send-confirmation-email.js",
  stepemailfn: "netlify/functions/send-step-email.js",
  notifyopenfn: "netlify/functions/notify-step-open.js",
  stepopentest: "netlify/functions/step-open-test-send.js",
  mockupopen: "reports/mockups/step_open_now_email_v1.html",
  stepinputfn: "netlify/functions/portal-step-input.js",
  stepchoicefn: "netlify/functions/portal-step-choice.js",
  gbppublishfn: "netlify/functions/gbp-publish.js",
  gbpapplyfn: "netlify/functions/gbp-apply-change.js",
  dupscan: "netlify/functions/gbp-duplicate-scan.js",
  duprecheck: "netlify/functions/gbp-duplicate-recheck.js",
  photoretire: "netlify/functions/_photo-retire.js",
  photolistname: "netlify/functions/_photo-list-name.js",
  contract: "netlify/functions/contract-generate.js",
  pricing: "pricing/index.html",
  photoremove: "netlify/functions/portal-photo-remove.js",
  secondlogo: "shared/photo-second-logo.js",
  photokeep: "netlify/functions/portal-photo-keep.js",
  busyjs: "shared/busy.js",
  gbpwatch: "netlify/functions/_gbp-watch.js",
  gbpdrift: "netlify/functions/admin-gbp-drift.js",
  recordfn: "netlify/functions/_record.js",
  gbpfacts: "netlify/functions/_gbp-facts.js",
  areacover: "netlify/functions/_gbp-area-cover.js",
  areaadd: "netlify/functions/admin-gbp-area-add.js",
  svcpush: "netlify/functions/admin-gbp-services-push.js",
  catpush: "netlify/functions/admin-gbp-categories.js",   // admin_step31_categories_v1: add / check / drop   // admin_step32_services_v1: the client's approved services on Google   // step4_done_in_portal_v2 card B: five checks, then the change   // step4_done_in_portal_v2 (10-29): a covered area never touches Google
  portalgbpprofile: "netlify/functions/portal-gbp-profile.js",
  gbpprofilewatch: "netlify/functions/gbp-profile-watch.js",
  dupcleared: "netlify/functions/_dup-cleared.js",
  changeremovesql: "docs/supabase/RGA_CLIENT_PHOTO_CHANGE_REMOVE_2026-10-15.sql",
  dupoverride: "netlify/functions/gbp-listing-override.js",
  notifyrga: "netlify/functions/notify-rga.js",
  nightlyfn: "netlify/functions/metrics-daily-refresh.js",
  detailedpage: "new-client-playbook/detailed/index.html",
  oauthcb: "netlify/functions/oauth-google-callback.js",
  photoartA: "shared/photo-art/A.json",
  photoartjs: "shared/photo-art.js",
  photokit: "scripts/photo-examples/kit.js",
  photoscenes: "scripts/photo-examples/scenes.js",
  photoartE: "shared/photo-art/E.json",
  photoartB: "shared/photo-art/B.json",
  photoartC: "shared/photo-art/C.json",
  photoartD: "shared/photo-art/D.json",
  photoartF: "shared/photo-art/F.json",
  photoartG: "shared/photo-art/G.json",
  gmail: "netlify/functions/_gmail.js",
  emaildoc: "shared/email-doc.js",
  replyfn: "netlify/functions/portal-reply.js",
  monthlyreport: "netlify/functions/send-monthly-report.js",
  // 🔑 A gate can be the thing under test: this one's own rule is what a mutation targets.
  playbookgate: null,
  // 🔑 SCRAPER-SIDE targets (prefix "scraper:"): copied to <tmp>/__scraper/<rel>; the gate finds the copy via
  // SCRAPER_COPY_DIR. Added 2026-10-09 for check-every-video-page-ships (rebuild-broken-videos.sh).
  rebuild: "scraper:scripts/rebuild-broken-videos.sh",
  netlifyforecast: "scraper:scripts/lib/netlify-credit-forecast.mjs",
  overnightlocal: "scraper:scripts/overnight-local.sh",
  dailyhealth: "scraper:scripts/daily-health-check.sh",
  nightlyfull: "scraper:scripts/nightly-full-check.sh",
  weeklyaudit: "scraper:scripts/weekly-audit.sh",
  weeklyauditprompt: "scraper:scripts/weekly-audit-prompt.md",
  reviewrunner: "scraper:scripts/refresh-review-metrics.mjs",
  braindispatch: "netlify/functions/brain-weekly-dispatch.js",
  flowcrondaily: "netlify/functions/flow-cron-daily.js",
  flowcrondigest: "netlify/functions/flow-cron-weekly-digest.js",
  walkclients: "scraper:scripts/acceptance/clients.mjs",
  walk: "scraper:scripts/acceptance-walk.mjs",
  googlecheck: "netlify/functions/admin-google-check.js",
  pubsafety: "netlify/functions/_publish-safety.js",
  publishwatch: "netlify/functions/site-publish-watch.js",   // auto_live_and_proof_v1: merged → live by itself
  portalmergechoice: "netlify/functions/portal-merge-choice.js",   // merge_without_the_browser_v1: who presses Merge (client)   // publish_safety_checks_v1: an upload proves it's the right website   // admin_fixes_1028_v1: Check Google now (read only)
  openmoves: "netlify/functions/_open-moves.js",   // todo_inbox_v1 (10-26): the one list of open moves
  adminopenmovesfn: "netlify/functions/admin-open-moves.js",
  portalopenmovesfn: "netlify/functions/portal-open-moves.js",
  morningfn: "netlify/functions/rga-todo-morning.js",
  adminhtml: "admin/index.html",   // todo_inbox_v1: the admin shell (nav + views)
  buildcs: "scripts/build-client-steps.mjs",   // todo_redesign_v1: the client-safe projection's allow-list
  donegate: "scraper:scripts/check-a-done-step-is-never-the-ask.mjs",   // its done-row measure
  steprecord: "netlify/functions/_step-record.js",
  probenumbering: "scraper:scripts/_probe-numbering.mjs",
  listingremoval: "netlify/functions/_listing-removal.js",
  gbpdupmod: "netlify/functions/_gbp-duplicate.js",
  listingflow: "netlify/functions/_listing-removal-flow.js",
  dupownerinit: "netlify/functions/gbp-duplicate-owner-init.js",
  dupremovefn: "netlify/functions/gbp-duplicate-remove.js",
  dupkeepfn: "netlify/functions/gbp-duplicate-keep.js",
  listingsql: "docs/supabase/RGA_CLIENT_LISTING_REMOVALS_2026-10-13.sql",
  admindeliv: "netlify/functions/admin-deliverables.js",
  portaldeliv: "netlify/functions/portal-deliverables.js",
  reviewreqfn: "netlify/functions/portal-review-requests.js",
  reviewlink: "netlify/functions/_review-link.js",
  reviewsfeed: "netlify/functions/_reviews-feed.js",
  photorefusal: "netlify/functions/_photo-refusal.js",
  gbpprofile: "netlify/functions/_gbp-profile.js",
  gbpverify: "netlify/functions/_gbp-verify.js",
  gbpverifyfn: "netlify/functions/portal-gbp-verify.js",
  stepinput: "netlify/functions/portal-step-input.js",
  bookinglink: "netlify/functions/_booking-link.js",
  recordcheck: "scripts/record-loss.mjs",
  siteplatform: "netlify/functions/_site-platform.js",   // step 2 builder detection (10-20)
  accessconfirm: "netlify/functions/admin-access-confirm.js",
  formtest: "netlify/functions/portal-form-test.js",   // the record check's own analysis (10-20)   // step10_booking_link_v1 (10-16)
  callpurpose: "netlify/functions/_call-purpose.js",   // batch 3 close-out booking (10-19)
  gbpposts: "netlify/functions/_gbp-posts.js",   // batch 4 Monthly posts (10-19)
  ytclips: "netlify/functions/_youtube-clips.js",   // batch 4 YouTube clips (10-19)
  maturefn: "netlify/functions/_mature.js",   // batch 5 Mature (10-19)
  month1report: "netlify/functions/_month1-report.js",   // research-backed Month 1 report (10-19)
  reviewpolicy: "netlify/functions/_review-policy.js",   // review gating policy (10-20)
  benchfn: "netlify/functions/vertical-benchmark-lookup.js",
  formintake: "netlify/functions/form-intake.js",
  fgaintake: "netlify/functions/fga-intake.js",
  adminmature: "netlify/functions/admin-mature.js",
  portalmature: "netlify/functions/portal-mature.js",
  videoclipfn: "netlify/functions/portal-video-clip.js",
  clientvideossql: "docs/supabase/RGA_CLIENT_VIDEOS_BUCKET_2026-10-19.sql",
  v2push: "netlify/functions/v2-push-gbp-content.js",
  bookkickfn: "netlify/functions/portal-book-kickoff.js",
  kickavail: "netlify/functions/kickoff-availability.js",
  callproviders: "netlify/functions/_call-providers.js",
  calltestfn: "netlify/functions/admin-call-test.js",
  ctsync: "netlify/functions/call-tracking-sync.js",
  reportjs: "portal/report/report.js",   // call tracking works anywhere (10-22)
  ctprovision: "netlify/functions/call-tracking-provision.js",
  steplock: "shared/step-lock.js",   // step_lock_after_rga_confirms_v1 (10-21)
  adminunlock: "netlify/functions/admin-step-unlock.js",
  siteplatfn: "netlify/functions/portal-site-platform.js",   // step3_website_access_v3 (10-20)
  siteplatdata: "data/site-platforms.json",   // the 22-builder audit, one source (10-20)
  sitechange: "shared/site-change.js",   // website_change_approvals_v1 (10-23)
  citypage: "netlify/functions/_city-page.js",
  pagefile: "netlify/functions/_page-file.js",   // website_system_v2 build 8 (10-28): a page file in the site's own template
  ghaccess: "netlify/functions/_github-access.js",
  deliverables: "netlify/functions/_deliverables.js",
  sitepreview: "netlify/functions/site-preview.js",   // for_your_approval_v2 (10-28): the built page, privately
  contractgen: "netlify/functions/contract-generate.js",   // rga_first_site_change_v1 (10-27): row 45 plans one city page from data
  snapshot: "netlify/functions/_site-snapshot.js",   // rga_client_access_and_work_v1 (10-23)
  snapshotfn: "netlify/functions/admin-site-snapshot.js",
  accessconfirmfn: "netlify/functions/admin-access-confirm.js",
  deliv: "netlify/functions/_deliverables.js",
  githubaccess: "netlify/functions/_github-access.js",
  bookingfn: "netlify/functions/admin-gbp-booking.js",   // step36_booking_rga_does_it_v1 (10-29): admin step 36 Put it on Google
  bookingkeep: "netlify/functions/portal-booking-keep.js",   // the client's Keep it on the booking-link To do
  profilefn: "netlify/functions/portal-gbp-profile.js",
  rgalogins: "netlify/functions/_rga-logins.js",   // admin_row9_vault_v2 (10-27): step 9 settles itself with step 8   // step3_admin_accept_v1 (10-27): accept the client's GitHub invite from admin

};
