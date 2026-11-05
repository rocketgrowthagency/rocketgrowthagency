#!/usr/bin/env node
/**
 * check-every-action-reports-a-result.mjs — pressing a button must visibly do something.
 *
 * ─── WHY ──────────────────────────────────────────────────────────────────────────────────────
 * 2026-09-06, Chris: *"clicking run does nothing?"* — the step HAD fired. `setBanner()` reported the
 * result into a static div at the top of the page, and the 58-step checklist put the button ~1500px
 * below it. Nothing he could see changed.
 *
 * 🔑 **A button with no visible result is indistinguishable from a dead button.** The user cannot
 * tell "it worked silently" from "it is broken" — so they press it again, or give up and do the work
 * by hand.
 *
 * We already had HALF a standard, locked 2026-08-18 ([[feedback-admin-confirm-and-view-state]]):
 * every consequential action must ASK FIRST via rgaConfirm(). Nobody had ever audited the other
 * half — that every action REPORTS ITS RESULT afterwards. This gate is that half.
 *
 * CHECK
 *   For every delegated `[data-*]` click action in the admin AND the client portal: the handler, or
 *   a function it calls, must reach a visible result — the banner, a status element, or an in-place
 *   state change on the control that was clicked. Pure-navigation actions are EXCUSED BY NAME.
 *
 * Exit 0 = every action reports. 1 = an action can complete silently. 2 = could not analyse.
 */
import fs from "node:fs";

// 🔑 THE SITE PATH IS A DEFAULT, NOT A CONSTANT — so this gate can be pointed at a scratch
// copy and its mutations actually run. → feedback_a_gate_that_cannot_fail
const __SITE = process.env.APPROVAL_ARCHIVE_SITE_DIR || "/Users/chris/RGA/Rocket Growth Agency Website VS Code";

const TARGETS = [
  { label: "admin", path: `${__SITE}/admin/admin.js` },
  { label: "portal", path: `${__SITE}/portal/portal.js` },
];

// Actions whose visible result IS the UI change they cause. Excused BY NAME with a reason — an
// exemption must be argued, never assumed (same discipline as the pre-flight gate list).
const UI_ONLY = {
  "data-dk-refresh": "re-reads the admin Data card and redraws it; changes nothing",
  "data-bl-refresh": "re-reads the admin Blog card and redraws it; changes nothing",
  "data-bl-all": "opens the full list on the admin Blog card; changes nothing",
  "data-mg-card": "RGA's managed hours / attributes / kickoff-answer cards (managed_admin_ui_v1, 11-4): a typed note or a picked choice inside the card is kept as a draft so a redraw never wipes it (visible: it is the field itself); nothing is saved. The saves (data-mg-put, data-mg-undo, data-mg-record) each show a message in the card.",
  "data-mw-card": "RGA's managed working cards on admin steps 27, 28, 19, 32, 26 (admin_client_cards_moved_v1, 11-4): a typed value or a ticked service inside the card is kept as a draft so a redraw never wipes it (visible: it is the field the person just typed in or ticked); nothing is sent. Every press in the card reports its own result (check-managed-admin-working-cards presses each one)",
  "data-bl-read": "the 'I read every line' tick on the admin Blog card: it only unlocks the Publish button beside it, which is the visible result; changes nothing",
  "data-ob-draft-copy": "copies a draft to the clipboard for a person to send; nothing is sent",
  "data-photo-keep-note": "removes the note on the spot; the choice stays in this browser, and nothing is sent",
  "data-cx-keep": "closes the Cancel fold on the spot; nothing is recorded because they chose not to cancel",
  "data-cs-how": "the client card system's foot \"How this step works ▾\" / \"Why these 5 ▾\" (client_card_system_v1, 2026-10-29): opens or folds the how-to inside the card and flips aria-expanded + the chevron (visible) — nothing is saved",
  "data-cs-ask": "the client card system's \"Change something\" under a locked card (client_card_system_v1, 2026-10-29): opens the lock's Need a change? panel under the card and scrolls to it (visible) — nothing is saved until \"Send to RGA\", which IS audited",
  "data-zc-goto": "admin step 29's \"Open the fix plan ›\" (admin_steps_29_38, 2026-10-29): scrolls to that step's row (visible) — nothing is saved",
  "data-zc-svc-check": "admin step 32's \"↻ Check Google now\" (admin_steps_29_38, 2026-10-29): a READ (dry: true) — spins while busy, then repaints the box from Google's answer, or writes \"Couldn't read Google\" + the reason in the box's pill and note (both visible) — nothing is written",
  "data-chg-convo": "the change-request band's conversation link (2026-10-27): opens the step's conversation and scrolls to it (visible) — nothing is saved",
  "data-fya-f": "For your approval's filter chips (approval_tab_and_sent_card_v1, 2026-10-28): show only one place's rows and mark the chip pressed (visible) — nothing is saved",
  "data-goto-approve": "the To do tab's \"N changes wait for your approval\" strip and the pointer banner (approval_tab_and_sent_card_v1, 2026-10-28): switches to the For your approval tab (visible) — nothing is saved",
  "data-mv-filter": "admin To do's header chips (todo_redesign_v1, 2026-10-26): filter the list on screen to late / due today / on track / waiting on clients and mark the chip pressed (visible) — nothing is saved",
  "data-photo-addmore": "step 10 done's \"Add more\" (steps_6_20_clean_v1): opens the photo list under the card and scrolls to it (visible) — each slot keeps its own Upload (2026-10-26)",
  "data-rc-add": "step 16's \"+ add another\" (steps_6_20_clean_v1): adds one more empty customer row and focuses it (visible) — nothing is saved until \"Send my list\" (2026-10-26)",
  "data-hc-change": "step 7's \"Change a day\" (steps_6_20_clean_v1): opens the hours editor already holding Google's hours and drops the button (visible) — nothing is saved until \"Save my hours\" (2026-10-23)",
  "data-r5-all": "step 13's \"Add all N at once\": shows the held-back customer forms and drops the button (visible) — nothing is saved until \"Write … request(s)\" (reviews_card_option_b_v1, 2026-10-23)",
  "data-in-notsure": "step 17's \"Not sure\" on a number: ticks the box and clears + disables that field (visible) — nothing is saved until \"Send my numbers\" (monthly_asks_v1, 2026-10-20)",
  "data-step-input": "step 7's hours listeners (input / change inside the form): show or hide the 24-hour tick and the long-closure note as they type — nothing is saved until Save (phase2_set_up_v1, 2026-10-20)",
  "data-bk-opt": "step 10's three choices (a page on my website / my booking tool / customers call us): the picked one gets the blue ring and its radio fills — nothing is saved until \"Put it on Google\" (step10_booking_link_v1, 2026-10-16)",
  "data-bk-type": "step 10's link-type chips (a restaurant: Reservations / Order ahead): redraws the choices for that type, the chip highlights — nothing is saved until \"Put it on Google\" (step10_booking_link_v1, 2026-10-16)",
  "data-gv-again": "step 2's Verify now: opens the ways Google offers under the card and hides itself, the panel visibly opens; nothing is sent until they pick one (client_open_calls_v1, 2026-10-30)",
  "data-gcard-how": "the Google card's \"How this step works\": opens step 2's how-to under the card and scrolls to it, the link reads \"Hide…\" — the panel visibly opens (one_google_card_v1, 2026-10-16)",
  "data-gcard-fix": "the Google card's \"Fix it\": scrolls to the field Google refused and focuses it — the focused field is the result (one_google_card_v1, 2026-10-16)",
  "data-ol-reply-open": "admin step 11 \"Keep ours…\": opens the reply box under the duplicate card and focuses it — the box visibly opens (2026-10-15)",
  "data-ps-resume": "the portal status page's sign-in link: notes the view to reopen, then the link navigates — the new page is the result (2026-10-15)",
  "data-gv-method": "step 6: picks how Google sends the code — the picked way visibly highlights (class sel, aria-checked) (2026-10-15)",
  "data-dup-pick": "the duplicate card: picks which listing to keep — the choice highlights and its follow-up line shows (2026-10-15)",
  "data-dup-wrong": "the duplicate card's \"wrong way round?\": opens the note box and focuses it — the box visibly opens (2026-10-15)",
  "data-ps-reload": "the portal status page's \"Try again\": reloads the page — the reload is the result (2026-10-15)",
  "data-tab": "switches the client tab — the tab visibly changes",
  "data-v2tab": "switches a sub-tab — the pane visibly changes",
  "data-goto-tab": "navigates to another tab — the destination is the feedback",
  "data-accordion-toggle": "expands/collapses a section — the section visibly moves",
  "data-ex-toggle": "opens the larger example drawing under a photo slot and sets aria-expanded — the drawing visibly opens (2026-10-09)",
  "data-ob-expand-all": "opens or folds every step in an Onboarding card and relabels itself — the steps visibly open (2026-10-09)",
  "data-ob-jump": "scrolls to another step on the same checklist and flashes it — the row visibly moves into view",
  "data-photo-lock-approvals": "on a locked photo step, opens the For-your-approval view where the duplicate listing and its how-to are — the view visibly changes (2026-10-12)",
  "data-photo-td-reason": "picks a turn-down reason and rewrites the previewed note under it — the note visibly changes (2026-10-12)",
  "data-photo-td-edit": "turns the previewed note into a text box in the turn-down panel — the box visibly opens (2026-10-12)",
  "data-pr-jump": "a count chip at the top of step 39 scrolls to its group of photos — the group visibly moves into view (2026-10-09)",
  "data-sent-more": "expands/collapses a sent email's body — the body visibly opens and the label flips",
  // 🔑 The shot list's two controls. Each one's result IS what you see: the panel opens under the
  // button (whose label flips to "Close the list"), and the whys appear or disappear in place. A
  // banner for either would be noise reporting something already on screen.
  // → project_the_shot_list_is_a_deliverable
  "data-dlv-open": "opens/closes the shot list panel in place — the list and the button's own label are the result",
  "data-dlv-whys": "shows/hides the why line on each shot — the rows visibly change, and the label flips",
  // ── the onboarding checklist's own view controls (2026-09-29 → 10-01). Each one's result IS the
  // list changing under it; there is nothing else to report. The one control here that MUTATES —
  // data-task-set — is NOT excused and is audited.
  "data-ob-view": "filters the checklist to one kind — the rows visibly change and the head recounts them",
  "data-ob-phase-toggle": "opens/closes a phase — the rows appear, and the phase marker is corrected in place",
  "data-ob-rollup-toggle": "opens/closes the automated-checks rollup — the rows appear",
  "data-setting-change": "opens the Change editor — the editor appearing IS the result, and it writes nothing; data-setting-save is the mutating action and IS audited",
  "data-setting-cancel": "closes the Change editor without writing anything — the editor disappearing IS the result",
  "data-field-help": "opens inline help — the text appearing is the feedback",
  "data-card-note": "opens the card's ⓘ note — the panel appearing IS the result, and the button carries aria-expanded",
  "data-note-id": "selects a note for editing — the editor visibly loads it",
  "data-custom-field": "focuses a custom field — no mutation",
  "data-doc": "opens a document — the document opening is the feedback",
  "data-updoc": "opens an uploaded document — same",
  "data-repeater-add": "adds an empty repeater row — the row visibly appears",
  "data-repeater-remove": "removes a repeater row — the row visibly disappears",
  "data-v2-edit": "opens a draft editor — the editor visibly opens",
  "data-flow-toggle": "expands a step's detail panel — the panel visibly opens",
  "data-portal-tab": "switches a portal tab — the pane visibly changes",
  "data-step-toggle": "expands a step — the step visibly expands",
  "data-mc-fix": "managed step 3's \"Fix something\" (and the \"Which is right?\" buttons): opens or closes the five covered steps' own cards under the summary, flips aria-expanded and the button's words — nothing is saved (client_portal_slim_v1, 11-4)",
  "data-rgachg-ask": "\"Ask for a change\" on an \"Updated by RGA\" line: presses that card's own ask control (opens its form, saves nothing), or says where to ask when the card has none (client_portal_slim_v1, 11-4)",
  "data-fct-qa": "About your business (client_setup_bottom_v1, 11-4): opens or closes that question's own answer form under its row and flips aria-expanded; nothing is saved, the form's own save reports",
  "data-mc-more": "the posts plan in What RGA is doing (client_step02_managed_access_v1, 11-4): shows the remaining pages and hides its own \"+ N more\" link; nothing is saved",
  "data-mc-rc": "an RGA card's action in \"What RGA is doing\" (See why · Change · Not mine · Turn off): opens or closes that step's own card and its ask-RGA form and flips aria-expanded — nothing is saved; the ask itself goes through the ordinary reported flag (client_portal_slim_v1, 11-4)",
  // ── Surfaced 2026-09-16 when the guard-case body stopped being a fixed 6000-char slice. The old
  //    window ran past the end of these short handlers into the NEXT one and borrowed its feedback
  //    call, so all three passed for a reason that had nothing to do with them. They are genuine
  //    navigation/disclosure: nothing is written, and the movement IS the result.
  "data-portal-goto": "switches the portal view — the destination pane is the feedback",
  "data-portal-scroll": "scrolls to an element in the same tab — the scroll is the feedback",
  "data-svc-access-toggle": "expands the how-to panel and relabels itself Show/Hide — no mutation",
  // ── 2026-09-21, step 2's CMS platform picker. Tapping a chip writes NOTHING: it highlights the
  //    chosen platform and swaps that platform's instructions into the panel below. The answer
  //    rides along with the secure link when the client submits, because it describes the thing
  //    they are about to send — one control, one act. The visible result IS the swap.
  "data-platform-pick": "selects a CMS platform — the chip highlights and its instructions replace the panel; nothing is written until submit",
  // ── 2026-09-21, the Messages redesign.
  "data-open-client": "opens that client's record — the destination IS the result, same as every other navigation control here",
  // 🔑 This one DOES write (it stamps messages_seen_at) but its result is visible twice over:
  //    the portal jumps to the step and the unread count on the Setup tab clears. Verified in a
  //    browser — count 1 → gone, step on screen — not assumed.
  "data-mark-thread-read": "jumps to the step and clears the unread count; both are visible immediately",
  "data-gap-toggle": "expands a gap card — the card visibly opens",
  "data-svc-diy-toggle": "expands the do-it-yourself steps and flips its arrow — no mutation",
  "data-stage-done-toggle": "expands a completed stage and relabels itself View/Hide — no mutation",
  // admin_system_health_v1 (10-31): the System health card's three controls. The first reads again (it spins, then the card repaints or says it couldn't read); the others only open what's there.
  "data-sh-refresh": "reads the jobs again — the button spins and the card visibly repaints, or says it couldn't read; nothing is written",
  "data-sh-each": "opens the grouped row into one row per job — the rows visibly appear; no mutation",
  "data-sh-open": "opens the folded card on other screens — the rows visibly appear; no mutation",
  "data-ap-toggle": "opens one approval in the queue and closes the others — the queue visibly moves",
  // The two gestures inside a step's input surface. Neither writes anything — the submit button
  // beside them is the mutating action, and it reports. Added 2026-09-16 with the input surfaces.
  "data-in-tick": "toggles one tick in a checklist — the pill visibly fills green",
  "data-in-closed": "marks a day closed and disables its time fields — both visibly change",
  "data-in-oneoff-add": "appends an empty closure row and focuses it — the row visibly appears",
  "data-oneoff-remove": "removes a closure row — the row visibly disappears; a blank one is kept so the field never vanishes entirely",
  // 🔒 business_on_google_v1 (10-16): picking an answer on one fact line — the pressed choice is ringed; "Save and check Google" reports
  "data-fact-pick": "picks the answer to one business fact — the pressed choice is visibly ringed; nothing is written until Save",
  "data-fact-other-go": "opens a box for the client's own words on one fact — the box visibly appears, focused",
  "data-fact-redo": "reopens an answered fact line — the question visibly comes back, amber",
  // 🔒 service_area_recommend_v2 (10-16): the service-area card's own taps — each visibly changes the card; "Use this list" saves
  "data-area-edit": "opens the service-area card — the card visibly appears with the input focused",
  "data-area-chip": "drops / restores one place — the chip visibly strikes through and the 20-place meter moves",
  "data-area-add": "adds a typed place as a chip — the chip visibly appears and the meter moves (or a line says why not)",
  "data-area-use": "carries the picked list into the line's answer — the answer visibly shows and the last open line saves (spins)",
};

// The legitimate ways an action can report. The global banner is the main one, but a dedicated
// status element or an in-place control state ("Saved", "Approved ✓", "Pushing…") is equally
// visible — and better, because it sits where the user clicked. Recognise all of them, or the gate
// cries wolf on code that is already doing the right thing.
const FEEDBACK = new RegExp([
  "\\bsetBanner\\(",
  "\\brgaAlert\\(",
  "\\balert\\(",
  "audit-confirm",
  "status(?:El|Element|Node|Msg)\\s*\\.\\s*(?:textContent|innerHTML)",
  // 🔑 THE IDIOM, NOT THE VARIABLE NAME. The line above only recognises a status element if someone
  // happened to call it `statusEl`. The owner-questions card writes `state.textContent = "Saved"` and
  // then reveals it — a perfectly visible report this gate could not see, so the debounced answer
  // save (`data-fq-detail`) read as silent. Match the SHAPE: a short human string assigned to
  // .textContent, followed by the element being shown or given a state class.
  "\\.textContent\\s*=\\s*[\"'`][^\"'`]{1,40}[\"'`]\\s*;[\\s\\S]{0,140}?\\.(?:hidden\\s*=\\s*false|className\\s*=|classList\\.add\\()",
  "\\.textContent\\s*=\\s*[^;]{0,80};[\\s\\S]{0,150}?\\.disabled\\s*=",
  "\\.textContent\\s*=\\s*[\"'`][^\"'`]*[\\u2713\\u2717\\u2026]",
  // The client portal has its own vocabulary — a modal, and in-place innerHTML state ("Saving…",
  // "Disconnecting…"). A gate that only knows the admin's primitives would report the portal as
  // broken while it was doing exactly the right thing.
  // 🔑 `\\bportal…` could not see `showPortalToast(` — no word boundary before a capitalised
  // "Portal" mid-identifier. The portal's most-used confirmation primitive, called in four places,
  // was invisible to this gate, so a handler that pops a toast reported as SILENT. A probe that
  // cannot see the right answer manufactures defects. → feedback_a_check_must_not_validate_itself
  "(?:^|[^A-Za-z])(?:show)?[Pp]ortal(?:Alert|Confirm|Modal|Toast)\\(",
  // 🔑 NOT [^;] — the spinner markup carries inline CSS, which is full of semicolons, so a
  // semicolon-bounded pattern died on the first style rule and reported a reporting action as silent.
  "\\.innerHTML\\s*=\\s*[\\s\\S]{0,400}?(?:\\u2026|Saving|Sending|Loading|Disconnect|Working)",
].join("|"));

function analyse({ label, path }) {
  if (!fs.existsSync(path)) return { label, error: `missing ${path}` };
  const src = fs.readFileSync(path, "utf8");

  const blockFrom = (openIdx) => {
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (!depth) return src.slice(openIdx, i + 1); }
    }
    return src.slice(openIdx);
  };

  // 🔴🔴 SKIP THE PARAMETER LIST. This took the FIRST `{` after the function name — so
  // `async function saveFacts(key, opts = {}) {` resolved to the default value `{}` and returned an
  // EMPTY body. Every function with an object default parameter was invisible to this gate: whatever
  // it reported, the caller read as silent. That is how `data-fq-detail` (the owner-questions
  // debounced save, which writes "Saved" into a status element) showed up as a silent action.
  //
  // 🔑 Balance the parentheses of the signature first, then take the brace after them.
  // → feedback_dead_check_selector_gap · feedback_a_check_must_not_validate_itself
  const bodyOf = (name) => {
    const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(|(?:const|let)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`);
    const m = src.match(re);
    if (!m) return "";
    const paren = src.indexOf("(", m.index);
    if (paren < 0) return "";
    let depth = 0, close = -1;
    for (let i = paren; i < src.length && i < paren + 2000; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") { depth--; if (!depth) { close = i; break; } }
    }
    if (close < 0) return "";
    const open = src.indexOf("{", close);
    return open < 0 ? "" : blockFrom(open);
  };

  // 🔴 BRACE-MATCH the branch that handles each action. Two earlier versions chunked N lines and
  // broke on a heuristic; handlers routinely bind several lookups adjacently and THEN branch:
  //     const promoteBtn = event.target.closest("[data-lead-promote]");
  //     const statusSelect = event.target.closest("[data-lead-status]");
  //     if (promoteBtn) { …setBanner… }
  // Any line-window rule truncated that and reported a reporting action as silent. A probe that
  // mis-parses is indistinguishable from a codebase full of defects, and it wastes the whole audit.
  const actions = [];
  // 🔑 Permissive on the RIGHT-HAND SIDE. Handlers bind in several styles and a strict pattern
  // silently drops the ones it does not know:
  //     const run = ev.target.closest && ev.target.closest("[data-onboard-run]");
  //     const b   = e.target.closest("[data-portal-goto]");
  // The coverage assertion below caught exactly this — it flagged 6 real actions the tightened
  // regex had stopped binding, which would otherwise have passed as a clean audit.
  // 🔑 AN ACTION DISPATCH READS FROM THE EVENT TARGET. A container lookup reads from another
  // element — `btn.closest("[data-svc-row]")` finds the row to animate, it is not a button anyone
  // clicks. Treating every closest() as an action reported `data-svc-row` as a silent action when
  // there is no such control at all. Requiring `.target.` is the discriminator.
  const bindRe = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]{0,120}?\btarget\b[^;\n]{0,60}?closest\("\[(data-[a-z0-9-]+)\]"\)/g;
  let m;
  while ((m = bindRe.exec(src)) !== null) {
    const varName = m[1];
    const action = m[2];
    const line = src.slice(0, m.index).split("\n").length;
    const after = src.slice(m.index);
    const guard = new RegExp(`if\\s*\\(\\s*!\\s*${varName}[\\s\\S]{0,40}?\\)\\s*(?:\\{[^}]{0,60}\\}|return[^;]*;)`);
    const branch = new RegExp(`if\\s*\\(\\s*${varName}\\b[^)]{0,100}\\)\\s*\\{`);
    const gm = after.match(guard);
    const bm = after.match(branch);
    let body;
    if (bm && (!gm || bm.index < gm.index)) body = blockFrom(m.index + bm.index + bm[0].length - 1);
    else if (gm) {
      // 🔴🔴 BRACE-MATCH, NEVER A FIXED WINDOW. This sliced 6000 characters after the early-return
      // guard — and the portal's `data-svc-set` handler reports at +6324 (a toast) and +6650 (an
      // alert in its catch). Both fell just outside, so a handler doing exactly the right thing was
      // reported as silent, and the "fix" would have been to add a SECOND confirmation to a screen
      // that already had one.
      //
      // 🔑 A window measured in characters fails the moment a handler grows. The header of this very
      // file already argues this for the branch case ("two earlier versions chunked N lines and broke
      // on a heuristic"); the guard case was never converted. Same reasoning, same fix: walk out to
      // the enclosing listener and match its braces.
      // → feedback_dead_check_selector_gap · feedback_a_check_must_not_validate_itself
      const listener = src.lastIndexOf("addEventListener(", m.index);
      const open = listener >= 0 ? src.indexOf("{", src.indexOf("=>", listener)) : -1;
      body = open >= 0 && open < m.index ? blockFrom(open) : after.slice(gm.index, gm.index + 6000);
    }
    else body = after.slice(0, 3000);
    actions.push({ name: action, line, body });
  }

  // 🔴 NO SILENT COVERAGE LOSS. If an action plainly exists but the binder could not bind it, say so
  // — otherwise it drops out of the audit and this gate reports a clean sweep it never performed.
  // Only attributes dispatched FROM AN EVENT TARGET are actions; the rest are container selectors.
  const declared = new Set([...src.matchAll(/\btarget\b[^;\n]{0,60}?closest\("\[(data-[a-z0-9-]+)\]"\)/g)].map((x) => x[1]));
  const captured = new Set(actions.map((a) => a.name));
  const dropped = [...declared].filter((d) => !captured.has(d) && !UI_ONLY[d]);

  // 🔴🔴 ORPHANED CONTROLS. An action ATTRIBUTE rendered onto a button with NO dispatcher anywhere is
  // the most dead a button can be — and the earlier version of this gate could not see it, because it
  // only inspected actions it found being dispatched. It shipped exactly that: an "↩ Undo" button
  // whose handler edit had aborted, so the control rendered and nothing listened.
  //
  // 🔑 A gate that only audits what is wired cannot catch what was never wired.
  // 🔴 EVERY data-attribute, not a list of PREFIXES somebody maintained. The allow-list below used
  // to read `data-(onboard|lead|note|v2|portal|svc|flow|repeater|updoc|goto|custom|google)-…`, so a
  // control named anything else was invisible to the orphan check — and on 2026-09-16 the portal's
  // new `data-attest-confirm` / `data-step-attest` buttons fell straight through it. Shipping them
  // with no handler at all would have passed this gate clean.
  //
  // 🔑 The container discriminator below is what makes the wide net safe: identifiers on cards and
  // rows are filtered by WHAT THEY SIT ON, not by whether their prefix was remembered.
  // → feedback_fix_the_class_not_the_instance · feedback_dead_check_selector_gap
  const rendered = new Set([...src.matchAll(/\bdata-[a-z][a-z0-9-]*=/g)]
    .map((x) => x[0].replace(/=$/, "")));
  // 🔑 A control can be wired THREE ways, not one. Delegation via closest("[data-x]"), a direct
  // listener found with querySelector(`[data-x="…"]`), or a read via getAttribute("data-x"). The
  // first version of this only knew delegation and declared 14 live controls dead — a mass finding,
  // which by our own rule means the PROBE is wrong before the code is. It was.
  //
  // An attribute is orphaned only if EVERY occurrence is a render site (`data-x="`): it is never
  // used as a selector (`[data-x`) and never read (`"data-x"`).
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔑 AN ORPHANED CONTROL IS A CONTROL. This gate already learned, on the dispatch side, that a
  // container lookup is not a button (`data-svc-row`) — and the fix there was to ask WHAT ELEMENT
  // the attribute sits on. The orphan side never asked, so it judged by suffix alone, and a
  // hand-maintained suffix list can only ever recognise the identifiers somebody remembered.
  //
  // 2026-09-16: deleting a genuinely dead lookup table made this report `data-portal-charts` as a
  // dead button. It is an attribute on `<article class="portal-card">` — a card identifier that
  // was never clickable. Flagging it would have pushed someone to "wire up" a control that does
  // not exist. → feedback_a_check_must_not_validate_itself · feedback_fix_the_class_not_the_instance
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const CONTROL_TAGS = /^(button|a|input|select|textarea|summary|label)$/i;
  /** Does EVERY place this attribute is rendered sit on a non-interactive container? */
  const onlyOnContainers = (attr) => {
    const sites = [...src.matchAll(new RegExp(`${attr}=`, "g"))];
    if (!sites.length) return false;
    return sites.every((s) => {
      // Walk back to the opening `<` of the element carrying the attribute and read its tag.
      const open = src.lastIndexOf("<", s.index);
      if (open < 0) return false;
      const tag = (src.slice(open + 1, open + 14).match(/^[a-zA-Z][a-zA-Z0-9]*/) || [""])[0];
      if (!tag) return false;
      if (CONTROL_TAGS.test(tag)) return false;
      // A div/article can still be a control if it is given a click role or a button class.
      const el = src.slice(open, s.index);
      return !/role="button"|class="[^"]*\b(btn|button|-choice|-tab|pm-amend)\b/.test(el);
    });
  };

  const orphans = [...rendered].filter((r) => {
    if (/-(id|scope|client|url|biz|visible|status|row|content-id|idx|part|label|detail)$/.test(r)) return false;
    const selector = new RegExp(`\\[${r}[\\]="]`);
    const read = new RegExp(`["'\`]${r}["'\`]`);
    if (selector.test(src) || read.test(src)) return false;
    // Unreferenced AND not on anything clickable → it is a stale identifier, not a dead button.
    if (onlyOnContainers(r)) return false;
    return true;
  });

  const SKIP = new Set(["if", "for", "while", "switch", "catch", "closest", "getAttribute",
    "preventDefault", "String", "Number", "querySelector", "parseInt", "Boolean"]);
  const silent = [];
  const seen = new Set();
  for (const a of actions) {
    if (seen.has(a.name)) continue;
    seen.add(a.name);
    if (UI_ONLY[a.name]) continue;
    let ok = FEEDBACK.test(a.body);
    if (!ok) {
      const callees = [...a.body.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)].map((x) => x[1]);
      for (const c of new Set(callees)) {
        if (SKIP.has(c)) continue;
        const b = bodyOf(c);
        if (b && FEEDBACK.test(b)) { ok = true; break; }
        if (b) {
          const inner = [...b.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)].map((x) => x[1]);
          if ([...new Set(inner)].some((c2) => !SKIP.has(c2) && FEEDBACK.test(bodyOf(c2)))) { ok = true; break; }
        }
      }
    }
    if (!ok) silent.push(a);
  }

  const excused = [...seen].filter((k) => UI_ONLY[k]).length;
  return { label, silent, dropped, orphans, total: seen.size, excused, audited: seen.size - excused };
}

console.log("── every action must report a result ──");

let fail = 0;
let indeterminate = 0;
for (const t of TARGETS) {
  const r = analyse(t);
  if (r.error) { console.log(`  ▫️  ${t.label}: ${r.error} — cannot audit`); indeterminate++; continue; }
  if (r.dropped.length) {
    console.error(`  🔴 ${r.label}: ${r.dropped.length} action(s) exist but could not be bound: ${r.dropped.join(", ")}`);
    console.error("     Fix the binder before trusting this gate — an unaudited action is not a passing one.");
    indeterminate++;
    continue;
  }
  for (const o of r.orphans || []) {
    fail++;
    console.log(`  🔴 ${r.label}/${o} — rendered on a control but NOTHING dispatches it. The button is dead.`);
  }
  for (const a of r.silent) {
    fail++;
    console.log(`  🔴 ${r.label}/${a.name.padEnd(26)} :${a.line} — no visible result on success or failure`);
  }
  console.log(`  ${r.silent.length || (r.orphans || []).length ? "🔴" : "✅"} ${r.label.padEnd(7)} ${r.audited} mutating action(s) audited · ${r.excused} excused as UI-only · ${(r.orphans || []).length} orphaned control(s)`);
}

console.log("");
if (fail) {
  console.error(`🔴 ${fail} action(s) can complete with nothing visible happening.`);
  console.error("   A button with no visible result is indistinguishable from a dead button.");
  console.error("   See feedback_every_action_must_report_its_result.");
  process.exit(1);
}
if (indeterminate) { console.error("⚠️  could not fully audit — see above"); process.exit(2); }
console.log("✅ every mutating action in the admin and the client portal reports a visible result");
