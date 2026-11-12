// mutation-targets.mjs — WHERE EACH MUTATION SUITE'S TARGET KEY POINTS. One map, imported by run-mutations.mjs (which
// applies the mutations) and check-every-mutation-still-applies.mjs (which checks every anchor still matches daily).
// A key → a path in the website repo, or "scraper:<path>" in this repo, or null (the gate itself is the target).
export const FILES = {
  // master plans-and-emails build (11-11)
  createcheckout: "netlify/functions/stripe-create-checkout.js",
  billingrules: "shared/billing-rules.js",
  startasclient: "netlify/functions/start-as-client.js",
  walkthroughui: "admin/walkthrough.js",
  contractpricing: "shared/contract-pricing.js",
  dailybillingfn: "netlify/functions/billing-daily-check.js",
  clientmonthly: "shared/client-monthly.js",   // client_monthly_v1 (11-9): the client-words rules + the between-months state, one file the server and the portal both read
  stepwhat: "data/playbooks/what-it-does.json",
  stepmapbuild: "scraper:scripts/build-step-map.mjs",   // the sheet of every step (Chris 11-1)
  // client_portal_slim_v1 + client_portal_slim_visual_v1 (approved 11-4): managed mode's numbering
  portalmode: "shared/portal-mode.js",
  managedsteps: "data/playbooks/managed-steps.json",
  portalmodesql: "supabase/client_portal_mode.sql",
  portalmessagefn: "netlify/functions/portal-message.js",
  // managed_admin_v1 (11-4): the 8 surfaces go by mode; the admin switch; RGA-side hours/attributes save + undo
  portalmodewords: "shared/portal-mode-words.js",
  portalmodefn: "netlify/functions/_portal-mode.js",
  adminportalmodefn: "netlify/functions/admin-client-portal-mode.js",
  admindetailssave: "netlify/functions/admin-gbp-details-save.js",
  // managed_admin_ui_v1 (11-4): the shared hours editor the managed admin cards use
  hourseditor: "shared/hours-editor.js",
  // kickoff_why_now_v1 (approved 11-01): the client's no to posts is kept; the card draws from the plan
  blogposts: "netlify/functions/portal-blog-posts.js",
  blogclientplan: "netlify/functions/_blog-client-plan.js",
  blogclientsql: "supabase/blog_client_choice.sql",
  // see_what_client_sees_v1 (approved 11-01)
  aicheck: "netlify/functions/_ai-check.js",   // admin_ai_search_v2 (approved 11-01): the Month 6 hand check, one line per tool
  seeclient: "shared/client-preview.js",
  previewguard: "shared/preview-guard.js",   // admin_recommended_fixes_v1 item 3: the guard, the read function, and the client functions whose auth it pins
  previewread: "netlify/functions/admin-preview-read.js",
  contractsfn: "netlify/functions/portal-get-contracts.js",
  auditsnapfn: "netlify/functions/portal-get-audit-snapshot.js",
  clientkit: "shared/client-card-kit.js",
  playbookclient: "data/playbooks/playbooks.json",   // see_what_client_sees: the 21 numbered client steps
  // onboarding_and_offboarding_v1 (approved 11-01)
  stepreminders: "netlify/functions/_step-reminders.js",
  calloutcome: "shared/call-outcome.js",
  closinglist: "netlify/functions/_closing-list.js",
  closingfn: "netlify/functions/admin-closing-list.js",
  onbnotes: "netlify/functions/_onboarding-notes.js",
  onbnotesfn: "netlify/functions/portal-onboarding-notes.js",
  leavingterms: "netlify/functions/_leaving-terms.js",
  portalcancel: "netlify/functions/portal-cancel.js",
  sendconfirmfn: "netlify/functions/send-confirmation-email.js",
  // ai_search_checks_v1 (approved 11-01): crawler check, audit rewrite, Yelp step
  crawleracc: "netlify/functions/_crawler-access.js",
  aireadiness: "netlify/functions/ai-readiness-audit.js",
  onpageaudit: "netlify/functions/site-onpage-audit-background.js",
  // audit_decisions_v1 #7 (approved 10-31): the listings check runs itself once
  listingsauto: "netlify/functions/_listings-autorun.js",
  // client_social_profiles_v1 (approved 10-31, built 11-01): the finder and the step
  socialprofiles: "netlify/functions/_social-profiles.js",
  socialfn: "netlify/functions/portal-social-profiles.js",
  // admin_blog_step_v1 (approved 10-31, built 11-01): a post is a website change
  blogpostlib: "netlify/functions/_blog-post.js",
  // blog_system_v1 + blog_cleanup_v1 (10-31, built 11-01)
  bloglinks: "netlify/functions/_blog-links.js",
  blogsys: "netlify/functions/_blog-system.js",
  blogidx: "netlify/functions/blog-index-check.js",
  blogadm: "netlify/functions/admin-blog.js",
  blogevidence: "netlify/functions/_blog-evidence.js",
  blogcleanup: "scripts/blog-cleanup.mjs",
  blogsql: "supabase/blog_system.sql",
  blogtoml: "netlify.toml",
  blogpostdeck: "blog/local-seo-for-deck-builders/index.html",
  blogindexpage: "blog/index.html",
  playbooksjson: "data/playbooks/playbooks.json",
  flowexec: "netlify/functions/flow-execute.js",
  blogchain: "netlify/functions/_blog-chain.js",
  blogsnap: "netlify/functions/blog-competitor-snapshot.js",
  leadlib: "netlify/functions/_supabase-lead.js",
  sitejs: "script.js",
  blogdrip: "scraper:scripts/drip-content.sh",
  // client_monthly_value_v1 (10-31): the monthly "what we watched for you" card
  monthlyvalue: "netlify/functions/_monthly-value.js",
  sitecheck: "netlify/functions/_site-check.js",
  sitewatch: "netlify/functions/site-watch.js",
  portalmonthlyvalue: "netlify/functions/portal-monthly-value.js",
  // pending_and_google_security_v1 (10-31): Google sign-in keys are sealed
  tokencrypt: "netlify/functions/_token-crypt.js",
  oauthcallback: "netlify/functions/oauth-google-callback.js",
  oauthdisconnect: "netlify/functions/oauth-google-disconnect.js",
  googletoken: "netlify/functions/_google-token.js",
  // google_login_one_home (approved 11-1): one function swaps a stored Google key for a token
  gtinventory: "netlify/functions/_google-inventory.js",
  gtadskeywords: "netlify/functions/_ads-keywords.js",
  gtlistingremoval: "netlify/functions/_listing-removal-flow.js",
  gtavailability: "netlify/functions/kickoff-availability.js",
  gtcancelinvite: "netlify/functions/cancel-kickoff-invite.js",
  gtga4: "netlify/functions/ga4-property-check.js",
  gtsendinvoice: "netlify/functions/send-invoice-email.js",
  gtprofile: "netlify/functions/v2-gbp-profile.js",
  gtrediscover: "netlify/functions/v2-gbp-rediscover.js",
  // client_core_change_approval_v1 (10-31): name, address, phone, main category need the client's approval of that exact value
  corechange: "netlify/functions/_core-change.js",
  corechangefn: "netlify/functions/core-change.js",
  gbpdrift: "netlify/functions/admin-gbp-drift.js",
  stepinput: "netlify/functions/portal-step-input.js",
  gbpwatch: "netlify/functions/_gbp-watch.js",
  // client_google_consent_v1 (10-31): no Google profile write without the client's recorded OK
  deadline: "netlify/functions/_deadline.js",
  googleconsent: "netlify/functions/_google-consent.js",
  googleconsentfn: "netlify/functions/portal-google-consent.js",
  oauthinitfn: "netlify/functions/oauth-google-init.js",
  respondreview: "netlify/functions/v2-respond-review.js",
  clientsteps: "data/playbooks/client-steps.json",
  // contract_v2_redline + pricing_page_v3 (10-31): the contract's money terms are what the code does
  billingdates: "netlify/functions/_billing-dates.js",
  cancellationfn: "netlify/functions/admin-record-cancellation.js",
  dailybilling: "netlify/functions/billing-daily-check.js",
  recordpayment: "netlify/functions/admin-record-payment.js",
  // admin_system_health_v1 (10-31): every job checks in, silence is an alarm
  jobstatus: "netlify/functions/_job-status.js",
  jobmanifest: "netlify/functions/_job-manifest.js",
  jobcheckinlib: "netlify/functions/_job-checkin.js",
  jobcheckinfn: "netlify/functions/job-checkin.js",
  jobwatcher: "netlify/functions/job-watcher.js",
  // the Nov 3-6 Airtable outage (11-7): the shared refusal check + one caller that must keep using it
  airtableok: "netlify/functions/_airtable-ok.js",
  trackopenfn: "netlify/functions/track-open.js",
  adminhealthfn: "netlify/functions/admin-system-health.js",
  jobsql: "supabase/job_checkins.sql",
  jobcheckinmac: "scraper:scripts/job-checkin.mjs",
  quiethc: "scraper:scripts/daily-health-check.sh",          // the database quiet period (11-6)
  quietbc: "scraper:scripts/before-confirming.mjs",
  quietfixer: "scraper:scripts/nightly-fixer-prompt.md",
  postssweepfn: "netlify/functions/gbp-posts-sweep.js",
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
  servicestold: "netlify/functions/admin-gbp-services-told.js",   // managed working cards 11-4
  servicespush: "netlify/functions/admin-gbp-services-push.js",
  brainbackground: "netlify/functions/v2-brain-analysis-background.js",   // the Brain prompt (Q&A retired 2025-11-03)
  exec: "netlify/functions/flow-execute.js",
  sitefacts: "netlify/functions/_site-facts.js",   // research fixes 11-01: service-area address, schema subtype, PSI field data
  auditweb: "netlify/functions/v2-audit-website.js",
  css: "admin/admin.css",
  portal: "portal/portal.js",
  playbook: "data/playbooks/playbooks.json",
  citdirs: "netlify/functions/_citation-directories.js",
  secondlogoshared: "shared/photo-second-logo.js",   // client_step10_photo_truth_v1
  backupdata: "scraper:scripts/backup-client-data.mjs",   // rga_data_backup_plan_v1
  backuplacie: "scraper:scripts/backup-lacie.sh",   // Chris 10-31: chats + repos on the Mac and LaCie
  restorecheck: "scraper:scripts/check-a-backup-restores.mjs",   // monthly restore test (11-01)
  recheck: "netlify/functions/portal-step-recheck.js",
  stepsql: "docs/supabase/RGA_CLIENT_STEP_RUNS_2026-10-07.sql",
  heavy: "netlify/functions/flow-execute-heavy-background.js",
  // master data audit 11-11 (approved): per-key writes into the Month 1 record (check-onboarding-writes-are-per-key) and contracts /
  // invoices that refuse the delete + the Stripe event ledger (check-contracts-cannot-be-deleted)
  onboardingpatch: "netlify/functions/_onboarding-patch.js",
  onboardingpatchsql: "docs/supabase/ONBOARDING_PER_KEY_WRITES_2026-11-11.sql",
  contractskeptsql: "docs/supabase/CONTRACTS_INVOICES_KEPT_2026-11-11.sql",
  resettestclient: "scripts/reset-test-client.mjs",
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
  paymentwelcome: "netlify/functions/_payment-welcome.js",   // admin_last_research_items_v1 item 4: the welcome at payment
  admincss: "admin/admin.css",
  // 11-11 security + content and AI masters (sec-ai): sign-ups closed, no secret in an address, metered model calls, the GBP words
  staffrules: "scraper:scripts/lib/staff-rules.mjs",   // check-no-one-is-staff-by-accident (11-11 lockdown + the insert case)
  sa_welcome: "netlify/functions/send-welcome-email.js",
  sa_portaluser: "netlify/functions/_portal-user.js",
  sa_portaluserfn: "netlify/functions/admin-portal-user.js",
  sa_auth: "netlify/functions/_auth.js",
  sa_quohook: "netlify/functions/quo-call-webhook.js",
  sa_citation: "netlify/functions/citation-audit.js",
  sa_flowexec: "netlify/functions/flow-execute.js",
  sa_reviewrunner: "scraper:scripts/refresh-review-metrics.mjs",
  sa_ledger: "netlify/functions/_ai-ledger.js",
  sa_ledgersql: "docs/supabase/AI_CALL_LEDGER_2026-11-11.sql",
  sa_modelcheck: "netlify/functions/ai-model-check.js",
  sa_toml: "netlify.toml",
  sa_brain: "netlify/functions/v2-brain-analysis-background.js",
  sa_photolook: "netlify/functions/_photo-look.js",
  sa_gbpdesc: "netlify/functions/_gbp-description.js",
  sa_gbpapply: "netlify/functions/gbp-apply-change.js",
  sa_gbppublish: "netlify/functions/gbp-publish.js",
  sa_svcpush: "netlify/functions/admin-gbp-services-push.js",
  sa_quarter: "netlify/functions/_monthly-quarter.js",
  sa_adminhtml: "admin/index.html",
  sa_adminjs: "admin/admin.js",
  // 11-11 (ui master): a Messages alert closes on a later success, plus Dismiss (check-a-messages-alert-closes-on-success)
  messagesalerts: "netlify/functions/_messages-alerts.js",
  adminmessagesfn: "netlify/functions/admin-messages.js",
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
  home: "index.html",
  startgrowth: "start-growth-plan/index.html",
  offerpricing: "data/offer-pricing.json",
  plansjson: "data/plans.json",
  gbpopt: "services/gbp-optimization/index.html",
  // website_audit_v1_v2 (10-31): the public site says only what it can back
  demopage: "demo/index.html",
  auditpage: "free-growth-audit/index.html",
  servicespage: "services/index.html",
  mapspage: "services/google-maps-local-seo/index.html",
  websitepage: "services/local-seo-website-support/index.html",
  termspage: "terms/index.html",
  apppage: "app/index.html",
  faqpage: "faq/index.html",
  processpage: "process/index.html",
  statepage: "state-of-local-seo/index.html",
  tradepage: "industries/plumbers/index.html",
  geocitypage: "local-seo/plumbers-in-culver-city-ca/index.html",
  contactpage: "contact/index.html",
  blogpost: "blog/gbp-services-attributes-and-q-and-a-the-underused-fields-that-convert/index.html",
  bloghub: "blog/index.html",
  blogpostgen: "scraper:scripts/generate-blog-post.mjs",
  photocheckfn: "netlify/functions/portal-photo-check.js",   // client_step10_upload_help_v1
  photolookfn: "netlify/functions/_photo-look.js",
  actormap: "scraper:flow/playbooks/_actor-map.mjs",   // client_step12_forms_v1
  blogfind: "netlify/functions/_blog-find.js",   // admin_blog_step_v1
  blogcheckfn: "netlify/functions/admin-blog-check.js",
  sitearchivelib: "netlify/functions/_site-archive.js",   // admin_site_archive_v1
  sitearchivejob: "netlify/functions/site-archive-run.js",
  sitearchivedel: "netlify/functions/admin-deliverables.js",
  sitearchivefn: "netlify/functions/admin-site-archive.js",
  sitearchivesql: "supabase/site_archive.sql",
  stylecss: "style.css",
  scriptjs: "script.js",
  contractdoc: "shared/contract-doc.js",
  sitemapbuilder: "scripts/build-sitemap.mjs",
  deploysite: "scripts/deploy-site.sh",
  approvedind: "data/approved-industries.json",
  fgabuilder: "netlify/functions/_fga-report-builder.js",
  v2generate: "netlify/functions/v2-generate-content-background.js",
  dripcontent: "scraper:scripts/drip-content.sh",
  blogengine: "scraper:scripts/blog-engine-cron.sh",
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
  adminstuck: "scraper:scripts/lib/admin-stuck.mjs",   // check-admin-tabs-render: a tab still loading or a logged render failure (11-5)
  // 🔑 SCRAPER-SIDE targets (prefix "scraper:"): copied to <tmp>/__scraper/<rel>; the gate finds the copy via
  // SCRAPER_COPY_DIR. Added 2026-10-09 for check-every-video-page-ships (rebuild-broken-videos.sh).
  rebuild: "scraper:scripts/rebuild-broken-videos.sh",
  netlifyforecast: "scraper:scripts/lib/netlify-credit-forecast.mjs",
  overnightlocal: "scraper:scripts/overnight-local.sh",
  dailyhealth: "scraper:scripts/daily-health-check.sh",
  nightlyfull: "scraper:scripts/nightly-full-check.sh",
  beforeconfirm: "scraper:scripts/before-confirming.mjs",
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
  setupfewer: "shared/setup-fewer.js",   // client_setup_fewer_v1 (11-5): the minimum + the note
  step3goahead: "shared/step3-go-ahead.js",   // client_step03_seven_day_rule_v1 (11-5): managed step 3's 7-day go-ahead, the rule + the words
  step3ep: "netlify/functions/portal-step3-go-ahead.js",   // the endpoint that hands its request to _step3-go-ahead.js handle (11-6 night fixer)
  step3fn: "netlify/functions/_step3-go-ahead.js",   // client_step03_seven_day_rule_v1: the nightly pass + the endpoint's actions
  siteread: "netlify/functions/_site-read.js",   // client_step03_seven_day_rule_v1: the smallest honest website read
  stepfewerfn: "netlify/functions/portal-step-fewer.js",   // client_setup_fewer_v1: finish with fewer + the move to Monthly
  month1report: "netlify/functions/_month1-report.js",   // research-backed Month 1 report (10-19)
  reviewpolicy: "netlify/functions/_review-policy.js",   // review gating policy (10-20)
  benchfn: "netlify/functions/vertical-benchmark-lookup.js",
  formintake: "netlify/functions/form-intake.js",
  fgaintake: "netlify/functions/fga-intake.js",
  videoclipfn: "netlify/functions/portal-video-clip.js",
  clientvideossql: "docs/supabase/RGA_CLIENT_VIDEOS_BUCKET_2026-10-19.sql",
  v2push: "netlify/functions/v2-push-gbp-content.js",
  bookkickfn: "netlify/functions/portal-book-kickoff.js",
  kickavail: "netlify/functions/kickoff-availability.js",
  callproviders: "netlify/functions/_call-providers.js",
  calltestfn: "netlify/functions/admin-call-test.js",
  ctsync: "netlify/functions/call-tracking-sync.js",
  metricsjs: "netlify/functions/_metrics.js",   // the monthly report reads true (research audit, 10-31)
  // gbp_protocols_v1 (11-1): the Google profile safety steps
  gbpsafetyshared: "shared/gbp-safety.js",
  gbpsafety: "netlify/functions/_gbp-safety.js",
  gbpsafetyfn: "netlify/functions/admin-gbp-safety.js",
  clientalerts: "netlify/functions/_client-alerts.js",   // the alert list (report_and_measurement_v1, 11-1)
  alertswatch: "netlify/functions/client-alerts-watch.js",
  whynowsql: "supabase/report_why_now.sql",
  reportjs: "portal/report/report.js",   // call tracking works anywhere (10-22)
  ctprovision: "netlify/functions/call-tracking-provision.js",
  steplock: "shared/step-lock.js",   // step_lock_after_rga_confirms_v1 (10-21)
  adminunlock: "netlify/functions/admin-step-unlock.js",
  siteplatfn: "netlify/functions/portal-site-platform.js",   // step3_website_access_v3 (10-20)
  siteplatdata: "data/site-platforms.json",   // the 22-builder audit, one source (10-20)
  pagereadback: "netlify/functions/_page-readback.js",   // website_system_v2 builds 10-12, 14, 16 (11-01)
  pagemeasure: "netlify/functions/_page-measure.js",
  webautorun: "netlify/functions/_website-autorun.js",
  titlemeta: "netlify/functions/_title-meta.js",
  headlinecta: "netlify/functions/_headline-cta.js",
  pagespeed: "netlify/functions/_page-speed.js",   // step17_speed_and_send_now_v1 (11-7)   // headline_cta_recipe_v1 (11-7)   // title_meta_recipe_v1 (11-7)
  sitechangewatch: "netlify/functions/site-change-watch.js",
  metricsdaily: "netlify/functions/metrics-daily-refresh.js",
  pagebrief: "netlify/functions/_page-brief.js",   // website_system_v2 builds 3 to 6, 15 (11-01)
  pagebuilder: "netlify/functions/_page-builder.js",
  pageprooffn: "netlify/functions/portal-page-proof.js",
  sitechange: "shared/site-change.js",   // website_change_approvals_v1 (10-23)
  citypage: "netlify/functions/_city-page.js",
  pagefile: "netlify/functions/_page-file.js",
  pagedesign: "netlify/functions/_page-design.js",   // page_builder_site_design_v1 (11-7)   // website_system_v2 build 8 (10-28): a page file in the site's own template
  schemamerge: "netlify/functions/_schema-merge.js",   // schema_merge_v1 (11-7)
  pageplace: "netlify/functions/_page-placement.js",   // page_placement_and_links_v1 part 2 (11-7)
  placepages: "netlify/functions/_place-pages.js",   // website_steps_46_50_research_v1 (11-7): steps 46 and 47
  internallinks: "netlify/functions/_internal-links.js",   // page_placement_and_links_v1 part 3 (11-7): step 50
  publishblocked: "netlify/functions/_publish-blocked.js",   // admin_publish_blocked_warning (11-8): the five publish checks
  videomove: "netlify/functions/_video-move.js",   // rga_videos_to_storage_v1 (11-8): outreach videos to file storage
  videotostorage: "scraper:scripts/outreach-video-to-storage.mjs",   // rga_videos_to_storage_v1 (11-8): a new or rebuilt video to storage, read back
  onelead: "scraper:scripts/test-realtime-one-lead.sh",
  nightpipeline: "scraper:scripts/overnight-pipeline.sh",
  recorder3: "scraper:step-3-video-recorder.mjs",   // check-a-locked-screen-cannot-stop-a-video (11-12)
  nightrollup: "scraper:scripts/check-run-productivity.mjs",   // check-a-locked-screen-cannot-stop-a-video (11-12)
  videotemplate: "scraper:templates/video-landing.html",   // rga_video_address_v1 A (11-8): the outreach page template
  pagesfromstorage: "scraper:scripts/outreach-pages-play-from-storage.mjs",   // rga_video_address_v1 A (11-8)
  hostcheck: "netlify/functions/_host-check.js",
  ghidentity: "netlify/functions/_github-identity.js",   // rga_github_app_v1 (11-8)
  // integrations_hardening_v1 (11-11, check-integrations-are-watched-from-the-cloud): the cloud integration checks, the Anthropic meter, the budgets
  integrationchecks: "netlify/functions/_integration-checks.js",
  integrationwatchfn: "netlify/functions/integration-watch.js",
  budgetwatchfn: "netlify/functions/budget-watch.js",
  netlifyforecastfn: "netlify/functions/_netlify-credit-forecast.js",
  quokeyfn: "netlify/functions/_quo-key.js",
  ghconnectionfn: "netlify/functions/admin-github-connection.js",
  offboarding: "netlify/functions/_offboarding.js",   // client_offboarding_v1 (11-8): end of service runs itself
  offboardrun: "netlify/functions/offboarding-run.js",
  offboardconfirm: "netlify/functions/admin-offboarding-confirm.js",
  ghappfn: "netlify/functions/portal-github-app.js",   // client_github_app_install_v1 (11-8): the client installs RGA's app
  pubsafety: "netlify/functions/_publish-safety.js",   // website_access_host_builds_v1 (11-8)
  pubwatch: "netlify/functions/site-publish-watch.js",
  mergechoice: "netlify/functions/portal-merge-choice.js",
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

  // data_keep_v1 (10-31): what we keep, and that it can't quietly stop
  rawstore: "netlify/functions/_raw-store.js",
  dkgridfn: "netlify/functions/v2-rank-grid-background.js",
  gscdaily: "netlify/functions/_gsc-daily.js",
  gscfn: "netlify/functions/gsc-daily-rows.js",
  gscsitemaps: "netlify/functions/_gsc-sitemaps.js",   // the weekly sitemap error read (11-01)
  benchbuild: "netlify/functions/vertical-benchmark-build.js",
  benchscraper: "scraper:scripts/build-vertical-benchmark.mjs",
  changeledger: "netlify/functions/_change-ledger.js",
  gbppurge: "netlify/functions/_gbp-purge.js",
  gbppurgefn: "netlify/functions/gbp-30-day-purge.js",
  aireadinessfn: "netlify/functions/ai-readiness-audit.js",
  citationauditfn: "netlify/functions/citation-audit.js",
  maturedeps: "netlify/functions/_mature-deps.js",
  googleliveread: "netlify/functions/_google-live.js",
  datakeepfn: "netlify/functions/admin-data-keep.js",
  datakeepsql: "supabase/data_keep.sql",
  gbpkeep: "netlify/functions/_gbp-keep.js",   // pending_and_google_security_v1 Part 2 (10-31): the 30-day rule for Google numbers in the monthly records
  // rank grid park lifted (10-31)
  rankschedule: "netlify/functions/_rank-schedule.js",
  schedulev6js: "admin/schedule.js",   // schedule_system_v6 (11-10)
  schedulev6dlg: "admin/schedule-dialogs.js",
  schedulev6calls: "admin/calls.js",   // v6 leftovers (11-11)
  schedulev6remind: "netlify/functions/_call-reminders.js",
  schedulev6remfn: "netlify/functions/call-reminders.js",
  schedulev6data: "netlify/functions/schedule-data.js",
  schedulev6cb: "netlify/functions/_callback-slots.js",
  schedulev6slots: "netlify/functions/_kickoff-slots.js",
  schedulev6recap: "netlify/functions/send-kickoff-recap.js",
  schedulev6mf: "netlify/functions/_job-manifest.js",
  schedulev6sql: "docs/supabase/SCHEDULE_V6B_2026-11-11.sql",
  rgacalls: "netlify/functions/_rga-calls.js",   // call_names_v1 (11-10): the one table of call names
  walkthroughbook: "netlify/functions/walkthrough-book.js",
  rankvalidate: "netlify/functions/validate-tracked-keyword.js",
  // reviews_additions_v1 (11-01): replies read back live, the asked-to-reviewed funnel
  replylive: "netlify/functions/_reply-live.js",
  reviewfunnel: "netlify/functions/_review-funnel.js",
  // citations_additions_v1 (11-01): the NAP check reads the audit's rows, the list fits the client, the recheck
  citnapaudit: "netlify/functions/citation-audit.js",
  citrade: "netlify/functions/_citation-trade.js",
  reviewmsg: "netlify/functions/admin-review-message.js",   // steps_59_63_v1 (11-9): Edit / Rewrite / check on the review request message
  citrecheck: "netlify/functions/_citation-recheck.js",
  citrecheckfn: "netlify/functions/citation-recheck.js",
  // data_keep_v1 / data_store_v1 (11-01): Analytics by day and page, page indexing status, the baseline at signing
  ga4daily: "netlify/functions/_ga4-daily.js",
  urlinspect: "netlify/functions/_url-inspect-keep.js",
  baselinefn: "netlify/functions/_baseline.js",
  contractsignfn: "netlify/functions/contract-sign.js",
  datakeepmoresql: "supabase/data_keep_more.sql",
  // report_and_measurement_v1 (11-01): hours and phone changes on the month's record
  monthevents: "netlify/functions/_month-events.js",
  // admin_last_research_items_v1 (11-01): which page the Google profile links to
  gbplanding: "netlify/functions/_gbp-landing.js",
  gbplandingfn: "netlify/functions/admin-gbp-landing.js",
  gbplandingbg: "netlify/functions/admin-gbp-landing-background.js",   // step 42 deciding in the background (11-6)
  // admin_step42_landing_auto_v1 (11-06): the step decides itself, and reads again each month
  gbplandingrun: "netlify/functions/_gbp-landing-run.js",
  // admin_last_research_items_v1 item 2 (11-01): the runbook when a name, address or phone changes
  citrunbook: "netlify/functions/_citation-runbook.js",
  citrunbookfn: "netlify/functions/admin-citation-runbook.js",
  // admin_last_research_items_v1 item 3 (11-01): directories found by searching brand names, off by default
  citbrand: "netlify/functions/_citation-brand-discovery.js",
  // report_live_google_30_day_v2 Part A (11-02): Google numbers read live through one reader
  googlelive: "netlify/functions/_google-live.js",
  googlenumbers: "netlify/functions/_google-numbers.js",
  googlefn: "netlify/functions/portal-google-numbers.js",
  // month1_email_v1 + portal_after_month1_v1 (11-9)
  month1email: "netlify/functions/_month1-email.js",
  month1sendfn: "netlify/functions/admin-month1-report.js",
  googlelivejs: "shared/google-live.js",
  // citations_52_55_v1 (11-9): admin steps 52–55, the sign-ups RGA presses and the proof that each listing is live
  citbuild: "netlify/functions/_citation-build.js",
  citprogress: "shared/citation-progress.js",
  citbuildfn: "netlify/functions/admin-citation-build.js",
  citlivejob: "netlify/functions/citation-live-check.js",
  // steps_57_64_v1 (11-9): every admin step skips and opens, steps 57/58/61/62/64, and the morning run that starts the steps that run themselves
  stepskip: "netlify/functions/_step-skip.js",
  stepskipfn: "netlify/functions/admin-step-skip.js",
  steppressfn: "netlify/functions/admin-step-press.js",
  steps5764: "shared/steps-57-64.js",
  reviewstep: "netlify/functions/_review-step.js",
  morningrun: "netlify/functions/_morning-run.js",
  morningrunjob: "netlify/functions/morning-run.js",
  ytread: "netlify/functions/_youtube-read.js",
  openmonth: "netlify/functions/_open-month.js",   // monthly_v1: the one creator of a month
  adminmonths: "netlify/functions/admin-months.js",
  monthlyreportsfn: "netlify/functions/monthly-reports.js",
  monthlysections: "shared/monthly-sections.js",
  monthlystart: "shared/monthly-start.js",   // monthly_start_v1: the focus rule, the cards, the portal line
  monthlyplanfn: "netlify/functions/admin-monthly-plan.js",
  monthlyweekly: "shared/monthly-weekly.js",   // monthly_s2_weekly_v1: the four weekly cards, the week strips
  replypost: "netlify/functions/_reply-post.js",   // monthly_s2_weekly_v1: an approved reply posts itself
  // tier3 item 2 (11-11, check-review-replies-within-two-days): Monthly 4 review replies within 1 to 2 days: the one rule, the 2-hour watch
  reviewreplies: "shared/review-replies.js",
  reviewrepliesfn: "netlify/functions/_review-replies.js",
  monthlyonce: "shared/monthly-monthly.js",   // monthly_s3_monthly_v1: the seven once-a-month cards
  monthlyoncesrv: "netlify/functions/_monthly-once.js",   // monthly_s3_monthly_v1: the reads and the settle
  monthlyclose: "shared/monthly-close.js",   // monthly_s5_close_v1: the five close-the-month cards
  monthlyclosesrv: "netlify/functions/_monthly-close.js",   // monthly_s5_close_v1: freeze, build, send, hand-off
  monthlyquarter: "shared/monthly-quarter.js",   // monthly_s4_quarterly_v1: the seven every-quarter cards
  healthfn: "netlify/functions/_monthly-health.js",   // mature_account_health_v1 (11-10): Account health 28-30 and the added quarter steps 31-33, reads and presses
  healthshared: "shared/monthly-health.js",   // mature_account_health_v1: the rules (churn, upsell, referral, letter, grow, AI check)
  healthadminfn: "netlify/functions/admin-monthly-health.js",   // mature_account_health_v1: RGA's endpoint
  monthlyquartersrv: "netlify/functions/_monthly-quarter.js",   // monthly_s4_quarterly_v1: reads, settle, presses, the client answers
  monthlyclosefn: "netlify/functions/admin-monthly-close.js",   // monthly_s5_close_v1: the only door that sends a monthly report
  monthlyreportemail: "netlify/functions/_monthly-report-email.js",   // monthly_s5_close_v1: the report letter
  weekskipfn: "netlify/functions/admin-week-skip.js",
  weeklyreadfn: "netlify/functions/admin-monthly-weekly.js",
  monthlyplanread: "netlify/functions/_monthly-plan.js",
  adminjs: "admin/admin.js",
  portalquarteranswer: "netlify/functions/portal-quarter-answer.js",
  postswantedfn: "netlify/functions/portal-posts-wanted.js",   // monthly_before_january_v1: the client's posts-per-month choice
  // 11-11 opted-out twins: the daily job that suppresses a live lead sharing a website or inbox with an opted-out one, and the check whose rule it is
  twinsuppress: "netlify/functions/_twin-suppress.js",
  twinsuppressfn: "netlify/functions/lead-twin-suppress.js",
  dupidentity: "scraper:scripts/check-duplicate-identity-leads.mjs",
  // 11-11 Places SearchText 32/day: the shared daily budget every caller reads first, and the callers whose refusal must be said
  placesbudget: "netlify/functions/_places-budget.js",
  gbphoursfn: "netlify/functions/backfill-gbp-hours.js",
  placeidsfn: "netlify/functions/backfill-place-ids.js",
  fgaenrich: "netlify/functions/_fga-enrichment.js",
  // 11-11 master map decisions 1-5 + Tier 1 wording (check-one-wording-per-fact): the ONE call-length setting, the texts promise's server half
  calllength: "shared/call-length.js",
  remindermobilefn: "netlify/functions/portal-reminder-mobile.js",
  setupsplit: "shared/setup-split.js",
  // 11-11 master map Tier 1 #4/#5 + decision 6 (check-one-current-month): the ONE month rule and the RGA-only repair
  monthnow: "shared/month-now.js",
  repaircurrentmonth: "scripts/repair-one-current-month.mjs",
  // tier3_best_in_class_v1 section 1 (11-11): Leads to booked jobs (check-leads-match-the-provider)
  leadsshared: "shared/leads.js",
  leadsfn: "netlify/functions/_leads.js",
  portalleads: "netlify/functions/portal-leads.js",
  leadssql: "docs/supabase/CLIENT_LEADS_2026-11-11.sql",
  // master map Tier 2 (11-11): the steps that run themselves with RGA keeping a Hold (check-tier2-steps-run-themselves)
  autoaccept: "shared/auto-accept.js",
  autoacceptfn: "netlify/functions/_auto-accept.js",
  autoacceptadmin: "netlify/functions/admin-auto-accept.js",
  catauto: "netlify/functions/_categories-auto.js",
  formsettle: "shared/form-settle.js",
  stepsautopilot: "netlify/functions/steps-autopilot.js",
  // tier3_best_in_class_v1 section 3 (11-11): "Best of" lists and local mentions (check-a-mention-counts-only-when-seen-live)
  mentionsshared: "shared/mentions.js",
  mentionsfn: "netlify/functions/_mentions.js",
  mentionsadminfn: "netlify/functions/admin-mentions.js",
  mentionsportalfn: "netlify/functions/portal-mentions.js",
  mentionscheck: "netlify/functions/mentions-check.js",
  mentionssql: "docs/supabase/CLIENT_MENTIONS_2026-11-11.sql",
  // 11-11 master map Tier 1: the daily rating snapshot (client_gbp_snapshots); setupsplit is above
  gbpsnapshot: "netlify/functions/_gbp-snapshot.js",
  // tier3_best_in_class_v1 sections 4 + 5 (11-11): the competitor watch (check-a-spam-report-has-evidence) and the second review site (check-review-requests-never-ask-on-yelp)
  competitorwatch: "shared/competitor-watch.js",
  competitorwatchfn: "netlify/functions/_competitor-watch.js",
  reviewsites: "netlify/functions/_review-sites.js",
  reviewsitesdata: "data/review-sites.json",
  reviewsecondfn: "netlify/functions/review-second-site.js",
  // 11-11 checkers build (master map approved): the runs that check everything, the report the morning reds land in, and the gates' own logic
  rehearsal: "scraper:scripts/rehearse-night-run.sh",
  dailyreport: "scraper:scripts/write-daily-health-report.mjs",
  delivguard: "scraper:scripts/daily-deliverability-guard.sh",
  eosgate: "scraper:scripts/check-end-of-service-runs-itself.mjs",
  secretlib: "scraper:scripts/lib/secret-scan.mjs",
  cachebusterlib: "scraper:scripts/lib/cache-buster.mjs",
  staffrules: "scraper:scripts/lib/staff-rules.mjs",
  dormantlib: "scraper:scripts/lib/dormant-exports.mjs",
  airtablelib: "scraper:scripts/lib/airtable-forecast.mjs",
  flipslib: "scraper:scripts/lib/gate-flips.mjs",
  backuplib: "scraper:scripts/lib/backup-judge.mjs",
  mockuplib: "scraper:scripts/lib/mockup-match.mjs",
  // master client-messages (11-11, check-client-emails-have-no-em-dash + check-client-messages-build): the hold-and-undo queue, its sweep and RGA's
  // presses, the notice acknowledgment, the mid-month note, the notes drafter, the report's check-in time
  emailqueue: "netlify/functions/_client-email-queue.js",
  emailqueuefn: "netlify/functions/client-email-queue.js",
  clientemailfn: "netlify/functions/admin-client-email.js",
  noticeack: "netlify/functions/_notice-ack.js",
  // (midmonth: _mid-month-note.js was deleted 11-11: the one mid-month note is _mid-note.js, gated by check-the-mid-month-note-*)
  notesdraftfn: "netlify/functions/client-notes-draft.js",
  suggestedcall: "netlify/functions/_suggested-call.js",
  // master audit #8 (11-11): one definition per number (check-a-running-month-is-never-compared, check-one-leads-formula)
  sharedmetrics: "shared/metrics.js",
  // 11-11 tier3 items 9 + 10 (tier3_best_in_class_v1 s9, s10a, s10b): the campaign tag and the profile's two counters, the client's fix plan, Your numbers pre-filled
  profilevisits: "shared/profile-visits.js",
  fixplanclient: "shared/fix-plan-client.js",
  portalfixplanfn: "netlify/functions/portal-fix-plan.js",
  yournumbers: "shared/your-numbers.js",
  // master audit #9 billing (11-11): check-a-paid-invoice-always-settles + check-the-pause-follows-the-contract
  invoicepayfn: "netlify/functions/portal-invoice-pay.js",
  reconcilefn: "netlify/functions/stripe-reconcile-payments.js",
  billingrules: "shared/billing-rules.js",
  billingalert: "netlify/functions/_billing-alert.js",
  // automation clock + runbooks master pages (approved 11-11): one turn on the clients' database, the second alert channel, the blind spots
  prodturnsh: "scraper:scripts/lib/production-turn.sh",
  prodturnmjs: "scraper:scripts/lib/production-turn.mjs",
  backupplist: "scraper:scripts/launchd/com.rga.client-data-backup.plist",
  alerttext: "netlify/functions/_alert-text.js",
  outsideping: "netlify/functions/_outside-ping.js",
  cloudbilling: "netlify/functions/cloud-billing-probe.js",
  supahealth: "netlify/functions/supabase-health.js",
  magiclink: "netlify/functions/magic-link-delivery.js",
  pendingchris: "docs/supabase/PENDING_FOR_CHRIS.md",
  // master mockups #11 website work, #16 portal modes, #15 public site (approved 11-11): the version-checked writer + step rows (W2), the access
  // watch + removal alert (W4/W5), the weekly page measurement (W3), the daily form check's mark
  taskscas: "netlify/functions/_tasks-cas.js",
  clientsteprowssql: "docs/supabase/CLIENT_STEP_ROWS_2026-11-11.sql",
  accesswatch: "netlify/functions/_access-watch.js",
  measurerun: "netlify/functions/site-measure-run.js",
  formcheck: "netlify/functions/_form-check.js",
  robotstxt: "robots.txt",
  // master audit #7 + #15 + #16 (11-11): a signed client reaches the CRM; the video CTA keeps the lead
  startasclientfn: "netlify/functions/start-as-client.js",
  leadcrmfn: "netlify/functions/_lead-crm.js",
  outreachgs: "docs/apps-scripts/gmail-to-airtable.gs",
  // card_notice_designs_v1 (11-11): the client's notice list, reminder switches, approval comments, the mid-month note
  noticesshared: "shared/notices.js",
  noticesfn: "netlify/functions/_notices.js",
  portalnoticesfn: "netlify/functions/portal-notices.js",
  apcfn: "netlify/functions/approval-comments.js",
  midnotefn: "netlify/functions/_mid-note.js",
  adminmidnotefn: "netlify/functions/admin-mid-note.js",   // the admin presses for the mid-month note (11-11), guard injected as handle()'s default
  noticessql: "docs/supabase/NOTICES_AND_COMMENTS_2026-11-11.sql",
  // tier3_best_in_class_v1 items 7, 6, 8 (approved 11-11): the client health view, the AI sample, the link pilot
  clienthealth: "shared/client-health.js",
  clienthealthsrv: "netlify/functions/_client-health.js",
  adminclienthealthfn: "netlify/functions/admin-client-health.js",
  aisample: "shared/ai-sample.js",
  aisamplesrv: "netlify/functions/_ai-sample.js",
  aisamplebg: "netlify/functions/ai-sample-background.js",
  serpreserve: "netlify/functions/_serpapi-reserve.js",
  adminmonthlyquarterfn: "netlify/functions/admin-monthly-quarter.js",
  serpapibudgetlib: "scraper:lib/serpapi-budget.cjs",
  serpapibudgetcli: "scraper:scripts/serpapi-budget.mjs",
  // card_notice_designs_v1 §1 (11-11): THE ONE ADMIN CARD renderer (check-one-admin-card)
  admincard: "shared/admin-card.js",
};
