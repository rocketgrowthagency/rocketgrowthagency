/**
 * playbook.js — the RGA sales call SOP. ONE source of truth, mounted TWICE:
 *   1. a slide-over DRAWER inside the Call console (read mid-call, lead card stays visible underneath)
 *   2. a full-page view from the sidebar (review + new-hire training)
 *
 * Built from mockup-sales-playbook.html. Research behind the wording lives in
 * memory: feedback_sales_call_playbook.md — do not "improve" the openers back to polite versions,
 * several of them are counter-intuitive on purpose (see the ⚠ notes).
 *
 * Everything is data below; the renderer is dumb. Add a scenario = add an object.
 */
(function () {
  "use strict";

  const SAY = (t) => ({ k: "say", t });
  const DONT = (t) => ({ k: "dont", t });
  const WHY = (t) => ({ k: "why", t });
  const NOTE = (t) => ({ k: "note", t });
  const BRANCH = (items) => ({ k: "branch", items });
  // The steps the rep DOES (clicks, checks, sends) — numbered, in order. Say is what you speak,
  // Why is why it works, Action is what your hands do. Chris, 2026-10-02.
  const ACTION = (items) => ({ k: "action", items });
  // A pointer to another part of the playbook, written as a box instead of an arrow buried in a
  // sentence (Chris, 2026-10-02). `tab` is a section id, `h` is the EXACT heading or objection it
  // points at (null = the top of that tab), `lead` says when to go there. In admin it is a link that
  // jumps there; the printed PDF fills in the real page number. A pointer at a heading that does not
  // exist fails check-playbook-integrity — a renamed section can never leave a dead box behind.
  const SEE = (tab, h, lead) => ({ k: "see", tab, h, lead });

  const PB = [
    {
      id: "guided", tab: "Guided call", title: "Guided call",
      sub: "Live calls: click what they actually said and the next step opens. The other tabs are the full reference for training and prep.",
      guided: true, blocks: [],
    },
    {
      id: "inbound", tab: "They call us", title: "They call us",
      sub: "Inbound is the highest-intent call you'll get — they dialled you. Job: sound like a real business, find out what they want, leave with a SPECIFIC next step.",
      blocks: [
        WHY("Never end an inbound call with “someone will follow up.” A named day and time converts; a vague promise doesn't."),
        { k: "h", n: 1, t: "Answer — every time, the same way" },
        SAY("“Rocket Growth Agency, this is [name] — how can I help?”"),
        DONT("“Hello?” — you sound like a mobile, not a business. That costs you credibility in two seconds and you don't get it back."),
        { k: "h", n: 2, t: "Work out which call this is" },
        BRANCH([
          ["“You sent me a video”", "Best case → Got the video, below."],
          ["“Someone called me from this number”", "We rang them → Returning our call."],
          ["Found us on Google / referral", "Cold inbound → Fresh enquiry."],
          ["Existing client", "Not a sales call. Answer it, then log it."],
        ]),
        { k: "h", n: 3, t: "Got the video" },
        SAY("“Perfect — so you saw where [business] is sitting on the map for [search term]. What made you pick up the phone?”"),
        WHY("They've already self-qualified. Asking what prompted the call makes them say the pain out loud — far more persuasive than you naming it."),
        { k: "h", n: 4, t: "Returning our call" },
        SAY("“That was me — thanks for calling back. I'd looked up [business] for [search term] and put together a short breakdown of where you show up on Google Maps. Got two minutes for the short version?”"),
        DONT("Don't say “I'm not sure why we called.” Pull the lead up while they talk — the card has the search term and rank."),
        { k: "h", n: 5, t: "Fresh enquiry" },
        SAY("“Happy to help. Quickest way to start — what's the business, and what are people searching when they'd need you?”"),
        NOTE("Then look them up LIVE on the call. Their real rank on their real search is the most persuasive thing in this playbook, and it takes fifteen seconds."),
        { k: "h", n: 6, t: "Close every inbound the same way" },
        SAY("“Here's what I'd suggest — I'll run your free audit right now, Maps, site and mobile, so it's in your inbox before we hang up. Then we take 30 minutes to walk through it together.”"),
        ACTION([
          "Run the audit live and book the walkthrough — every line and every click is in the box below.",
          "Capture name, number and need in the call log, even if you solved it on the spot.",
        ]),
        SEE("close", "🧾 Run their audit live — before you book anything", "Run the audit, book, remind"),
        WHY("They called you, so the audit lands while their interest is highest. A link you send after the call gets finished by roughly one prospect in four; pressing submit yourself gets all of them."),
      ],
    },
    {
      id: "outbound", tab: "We call them", title: "We call them",
      sub: "Everyone in the queue already got a personalised video showing their Maps rank. You are never cold — lead with that.",
      blocks: [
        { k: "kpi", items: [["6.6×", "“How've you been?” vs a standard open"], ["2.1×", "stating your reason for calling"], ["0.9%", "“Did I catch you at a bad time?” — worst measured"]] },
        WHY("Gong, ~300M calls. ⚠ NEVER open by apologising for calling. Anchor the reason immediately — we have the best possible one: a video we made for them."),
        { k: "h", n: 1, t: "Warm-but-silent — watched the video, never replied" },
        SAY("“Hey [first name], it's [name] at Rocket Growth Agency — I sent you a short video a couple of weeks back showing where [business] comes up on Google Maps. Did you get a chance to watch it?”"),
        BRANCH([
          ["“Yeah, I saw it”", "“What stood out?” then STOP TALKING. What they say next is your whole call. They name a problem → ask “How long do you reckon it's been sitting like that?” then “What do you think's causing it?” and carry on through The call, beats 3–8. Vague → the ⏱ 30-SECOND VERSION below. “How much?” → the price line."],
          ["“Don't remember it”", "Say the ⏱ 30-SECOND VERSION below, straight through."],
          ["“Not interested”", "One attempt: “No problem. Can I ask: is Maps handled already, or just not a priority this year?” Still no → “All good — I'll check back in a couple of months with fresh ranking data.” Log Not interested. Never push a third time."],
        ]),
        { k: "h", n: "⏱", t: "30-SECOND VERSION — they don't remember the video, or they're vague" },
        SAY("“No worries — 30-second version: I looked up [business] for [search term] and you're showing at #[rank] on the map. The top three take most of the calls for that search — so I recorded exactly what's holding you back. Worth 90 seconds?”"),
        SEE("spine", "Problem — existence, then duration, then cause, then impact", "They told you what stood out — the questions that come next"),
        SEE("obj", "“Not interested” — flat, immediate", "They said not interested — the full version"),
        { k: "h", n: 2, t: "Never opened anything" },
        SAY("“Hi [first name] — [name] at Rocket Growth Agency. I'll be quick and you can tell me to get lost. I checked where [business] ranks for [search term] and you're at #[rank]. Do you know where you sit on Google Maps?”"),
        WHY("“You can tell me to get lost” is honest and gives them control — without the doormat framing of “is now a bad time?”, which measurably kills calls."),
        { k: "h", n: 3, t: "Replied once, then went quiet" },
        SAY("“Hey [first name] — you messaged back about the Maps video and then life happened, which I get. Still worth me sending the full audit over?”"),
        { k: "h", n: 4, t: "Booked callback" },
        SAY("“Hi [first name], [name] at Rocket Growth Agency — you asked me to call back today about the Google Maps audit. Still a good moment?”"),
        NOTE("This is the ONE time “is now still good?” is right — they chose the time, so you're confirming their decision, not apologising for yours."),
        { k: "h", n: 5, t: "Gatekeeper" },
        SAY("“Hi — could you point me to whoever looks after the website and the Google listing? I sent them a video about how the business shows up on Maps and I'm following up.”"),
        DONT("Don't pitch the gatekeeper or be vague about why you're calling. You're following up on something you already sent — act like it."),
        { k: "h", n: 6, t: "Returning an UNKNOWN number that called us" },
      WHY("A number rang us and left no name. We do NOT know whether they ever got a video, whether they are a prospect, or what they wanted. Every script above assumes context we do not have here — using one of them means opening with a guess, and a wrong guess on a stranger's voicemail is worse than saying little."),
      DONT("Don't say “I sent you a video”, don't name a business, don't quote a rank, don't pitch. You are returning a call, not starting a pitch. If you guess wrong they now think you are a spam caller who does not know who they rang."),
      SAY("VOICEMAIL — “Hi, this is [name] at Rocket Growth Agency in Culver City, returning your call. Sorry I missed you. Give me a ring back on (424) 242-2040 whenever suits and I'll help however I can. Thanks.”"),
      NOTE("Under 15 seconds. Say the number SLOWLY and twice if you have room. Do not text a stranger a link — a cold link from a company they cannot place reads as phishing."),
      SAY("IF THEY ANSWER — “Hi, this is [name] at Rocket Growth Agency — I had a missed call from this number, so I'm just returning it. What can I help with?”"),
      WHY("Handing them the first move is the whole trick: they tell you who they are and why they rang, and you have not claimed anything untrue. From their answer you are back in a known branch — got the video, fresh enquiry, or wrong number."),
      BRANCH([
        ["“You sent me a video”", "Pull their lead up while they talk, then the Got the video line (box below)."],
        ["Fresh enquiry / found us", "Look them up LIVE on the call, then the Fresh enquiry line (box below)."],
        ["Wrong number / not interested", "Log it and move on. Mark Wrong number so it never resurfaces."],
        ["Silent, spam, or won't say", "Log as Wrong number. Do not chase a number that will not identify itself."],
      ]),
      SEE("inbound", "Got the video", "They say you sent them a video"),
      SEE("inbound", "Fresh enquiry", "They found you on Google or by referral"),
      NOTE("“Call cannot be connected” on a callback usually means a SPOOFED or disconnected caller ID — common with robocalls. Log Wrong number and stop; there is nothing to reach."),

      { k: "h", n: 7, t: "Voicemail — a lead we DID send a video to" },
        SAY("“Hi [first name], [name] at Rocket Growth Agency. I sent you a short video showing where [business] ranks on Google Maps for [search term] — you're at #[rank]. I'll text you the link now so it's easy to find. [your number].”"),
        WHY("Then TEXT IMMEDIATELY. The voicemail exists to make the text expected. Most calls end here — treat the pair as one motion, not a failure."),
      ],
    },
    {
      id: "guard", tab: "Guard & tone", title: "Getting the guard down — and how you sound",
      sub: "The skill layer under every other tab. You cannot sell to someone whose guard is up, and the same words land completely differently depending on how you say them. Everything else assumes this.",
      blocks: [
        { k: "h", n: 1, t: "🔑 The frame that makes all of this legitimate" },
        WHY("Are you selling something you do TO people, or FOR them? Everything below depends on the answer. If you're doing it TO them, every technique here is manipulation and you'll sound like it. If you're doing it FOR them, then the truth is: when you fail to make the case, their problem stays exactly where it is and nothing changes."),
        SAY("The internal check, before you dial — “If they don't buy, is their situation actually worse?” If the honest answer is no, don't push. If it's yes, you owe them a proper conversation."),
        DONT("Don't use this as a licence to pressure. It cuts the other way too: it only holds while you'd genuinely accept a no. The moment you wouldn't, you're doing it TO them again."),
        NOTE("This is also the answer to the discomfort most people feel about sales. You're not extracting a decision, you're making sure a business owner who's losing calls to competitors actually finds out about it. That's a service — but only if it's true, which is why we never fabricate a finding."),
        { k: "h", n: 2, t: "The mask — who you're actually talking to" },
        WHY("Every prospect wears a mask: how they want to be seen, especially by a salesperson. Ask the public what salespeople are like and you get “pushy, scam, liars, manipulative” — so the mask goes on before you've said a word. Behind it you get polite, guarded, useless answers. Sell to the mask and you're selling to a person who doesn't exist."),
        NOTE("Getting the guard down isn't a warm-up you do before the real call. It IS the real call — nothing in the other tabs works until it happens."),
        { k: "h", n: 3, t: "🔴 What a price objection actually means" },
        WHY("“Too expensive” is usually a SYMPTOM of the guard still being up — not a problem with the number. A prospect who is still thinking in COST never got moved to thinking about the RESULT they want. If you're defending a price, the mistake happened earlier in the call, not at the number."),
        NOTE("So when you get it, log it — but also ask yourself which beat you skipped. The fix is upstream in beats 3–5, not a better comeback. The Objections tab handles it in the moment; this is how you stop getting it."),
        { k: "h", n: 4, t: "How the guard actually comes down" },
        BRANCH([
          ["Take the focus off you", "Your opening questions exist to put attention entirely on them — not to set up your pitch."],
          ["Make them laugh", "Humour releases dopamine, which calms the nervous system, which drops the guard. Playfulness is a TOOL, not a personality type. “Just trying to stay out of trouble — you keeping out of trouble over there?” beats “good thanks, how are you?”"],
          ["Ask permission to challenge", "“Can I challenge you on that?” outperforms simply challenging them. You hand them control at the exact moment you take a risk."],
          ["Never act like the stereotype", "Every pushy move confirms the mask and re-arms the guard. Rushing, talking over, and not taking a soft no all do it."],
        ]),
        { k: "h", n: 5, t: "Risk — flip the status quo" },
        SAY("“If nothing changes and you're still sitting at #[rank] this time next year — is that a problem, or is it survivable?”"),
        WHY("Prospects treat doing nothing as the SAFE option. Usually it isn't. Getting them to see that changing is less risky than staying put does more work than any feature list — and they have to reach it themselves for it to count."),
        { k: "h", n: 6, t: "🔑 Tone — what it actually is" },
        WHY("Your tone is how the prospect interprets your INTENTION behind everything you say and ask. It isn't decoration on the words — it's the channel that carries why you're asking. The same question is a genuine enquiry or an interrogation depending only on tone, and they respond to the intention, not the sentence."),
        NOTE("The proof: reps selling the same thing, at the same price, from the same script, to the same kind of prospect get radically different results. The words are identical, so the variable is delivery."),
        { k: "h", n: 7, t: "The five tones — and when to use each" },
        { k: "table", head: ["Tone", "Use it for", "On our calls"], rows: [
          ["<b>Curious</b>", "Default for nearly every question", "“Any idea where you land for [search term]?”"],
          ["<b>Confused</b>", "Getting them to explain and correct you", "“When you say you've got someone on it — how do you mean?”"],
          ["<b>Concerned</b>", "Consequence questions. Lean in.", "“And what does that cost you over a year?”"],
          ["<b>Challenging</b>", "Pushing on something they're avoiding", "“Can I challenge you on that?”"],
          ["<b>Playful</b>", "Dropping the guard early", "“Just trying to stay out of trouble — you?”"],
        ]},
        NOTE("Skeptical is a sub-tone of challenging, used to trigger a reframe: “you don't seem like the type who'd settle for whatever Google gives you — would I be right?” It lets them argue themselves out of a limiting belief."),
        { k: "h", n: 8, t: "Two mechanics you can use today" },
        NOTE("🔑 Your FACIAL EXPRESSION is the remote control for your tone. You can't easily control your voice directly, but you can control your face — and the voice follows. It works on the phone even though they can't see you. Smile before they pick up."),
        NOTE("The VERBAL PAUSE — a deliberate one-to-two second break MID-sentence, not just after a question. It slows you down, sounds like thinking rather than reciting, and breaks the salesperson cadence they're listening for."),
        { k: "h", n: 9, t: "The mirror — overstate their positive, then stop" },
        SAY("They say things are fine → “So it sounds like the listing's bringing in all the calls you need then.” … then PAUSE."),
        WHY("Most people won't defend an absolute. They downgrade it themselves — “well, I wouldn't say all of them…” — and now the problem is on the record in THEIR words, which is worth ten times you pointing it out."),
        DONT("Don't say it sarcastically and don't smirk. Flat and sincere, then silence. If it sounds like a trap it re-arms the guard instantly."),
      ],
    },
    {
      id: "spine", tab: "The call", title: "The call",
      sub: "Eight beats, in order. You're not pitching — you're finding the gap between where they think they rank and where they actually rank, then getting them to say out loud that they want it closed. Nothing is offered until beat 7.",
      blocks: [
        ACTION([
          "Beats 2–6 are the script, not a reference. Ask every question, in this order, one at a time, and wait for the answer before the next.",
          "Skip a question ONLY if they have already answered it. Asking again tells them you weren't listening.",
          "Your own words are fine, as long as it is the same question.",
        ]),
        { k: "h", n: 1, t: "Open" },
        NOTE("Pick the line for who you're calling. Same words as the We call them tab — here so you don't have to flip back mid-call."),
        SAY("WATCHED THE VIDEO, NEVER REPLIED — “Hey [first name], it's [name] at Rocket Growth Agency — I sent you a short video a couple of weeks back showing where [business] comes up on Google Maps. Did you get a chance to watch it?”"),
        BRANCH([
          ["“Yeah, I saw it”", "“What stood out?” then STOP TALKING. What they say next is your whole call. They name a problem → ask “How long do you reckon it's been sitting like that?” then “What do you think's causing it?” and carry on through The call, beats 3–8. Vague → the ⏱ 30-SECOND VERSION below. “How much?” → the price line."],
          ["“Don't remember it”", "Say the ⏱ 30-SECOND VERSION below, straight through."],
          ["“Not interested”", "One attempt: “No problem. Can I ask: is Maps handled already, or just not a priority this year?” Still no → “All good — I'll check back in a couple of months with fresh ranking data.” Log Not interested. Never push a third time."],
        ]),
        { k: "h", n: "⏱", t: "30-SECOND VERSION — they don't remember the video, or they're vague" },
        SAY("“No worries — 30-second version: I looked up [business] for [search term] and you're showing at #[rank] on the map. The top three take most of the calls for that search — so I recorded exactly what's holding you back. Worth 90 seconds?”"),
        SAY("NEVER OPENED ANYTHING — “Hi [first name] — [name] at Rocket Growth Agency. I'll be quick and you can tell me to get lost. I checked where [business] ranks for [search term] and you're at #[rank]. Do you know where you sit on Google Maps?”"),
        SAY("REPLIED ONCE, THEN WENT QUIET — “Hey [first name] — you messaged back about the Maps video and then life happened, which I get. Still worth me sending the full audit over?”"),
        SAY("BOOKED CALLBACK — “Hi [first name], [name] at Rocket Growth Agency — you asked me to call back today about the Google Maps audit. Still a good moment?”"),
        SEE("obj", "“Not interested” — flat, immediate", "They said not interested — the full version"),
        SEE("outbound", "Gatekeeper", "Someone else answers"),
        SEE("outbound", "Voicemail — a lead we DID send a video to", "Voicemail"),
        SEE("outbound", "Returning an UNKNOWN number that called us", "Calling back a number that rang us with no name"),
        { k: "h", n: 2, t: "Situation — ONE question, then move on" },
        SAY("“How are most customers finding you at the moment: referrals, Google, ads?”"),
        ACTION([
          "Ask it every time — then straight on to beat 3. No follow-ups about staff, years in business or anything else.",
          "Skip it only if they already told you where customers come from (often while answering “What stood out?”).",
        ]),
        WHY("It is the one thing the video can't tell you, and the answer sets up the call. “Mostly referrals” → Maps probably isn't working and they don't know what it costs. “Google” → they already value it, so their real rank lands harder. “Ads” → they're paying for calls the map could bring free. Only one question: we already know their situation — we filmed it, and time here is time not spent on beats 3–6."),
        { k: "h", n: 3, t: "Problem — existence, then duration, then cause, then impact" },
        SAY("Existence — “When someone searches [search term], any idea where you land?”"),
        SAY("Duration — “How long do you reckon it's been sitting like that?”"),
        SAY("Cause — “What do you think's causing it?”"),
        SAY("Impact — “And what does that mean day to day — are the phones where you'd want them?”"),
        ACTION([
          "All four, in this order: Existence → Duration → Cause → Impact. One at a time; wait for each answer.",
          "Skip one only if it's already answered — “we dropped off last year” has just answered Duration.",
          "Don't correct a wrong guess. Let “top five” sit when they're really at #12.",
        ]),
        WHY("Four questions, not one. Duration and cause are what turn an interesting fact into a problem they OWN — and a problem they diagnosed themselves is one they can't argue with later."),
        NOTE("The cause answer is diagnostic for YOU: bad luck, a bad agency, or their own neglect are three completely different calls. Don't correct a wrong guess — a prospect who says “top five” and sits at #12 has just handed you the call."),
        { k: "h", n: 4, t: "Solution — what have they already tried?" },
        SAY("“Have you tried to do anything about it?”"),
        SAY("“How did that go?”"),
        SAY("“If it worked the way you wanted, what would that actually look like for you?”"),
        ACTION([
          "All three, in this order, one at a time.",
          "They've tried nothing → skip “How did that go?” and go straight to beat 5.",
          "Skip any they've already answered.",
        ]),
        WHY("This is where “I've already got someone”, “my nephew does it” and “I got burned before” live. Asked HERE they're context you can use. Unasked, the same facts come back as objections at the end of the call, when they cost you the deal."),
        DONT("Don't react when they name an incumbent. Don't compete, don't criticise, don't start selling against them. Note it and carry on."),
        SEE("obj", "“I already have someone doing SEO”", "If it comes back later as an objection"),
        { k: "h", n: 5, t: "Consequence — make them price it" },
        SAY("“Roughly what's a new customer worth to you?”"),
        SAY("“And if the top three are taking most of those calls, what does that cost you over a year?”"),
        WHY("⭐ THE highest-yield question in the call. It makes the buyer price their own pain — more persuasive than anything you assert, and you'll never have to defend the number because it's theirs."),
        DONT("Don't fill the silence. Ask it, then stop talking and let them do the arithmetic out loud. The pause IS the technique."),
        { k: "h", n: 6, t: "Commitment — one sentence, BEFORE you offer anything" },
        SAY("“So — is this something you actually want to fix this year, or is it just not that big a deal right now?”"),
        WHY("Deliberately gives them a comfortable “no” — which is the only reason it works. Both answers win: a yes means the audit now answers THEIR question instead of being your pitch; a no saves you three chased callbacks and a soft maybe."),
        BRANCH([
          ["“Yeah, I want it sorted”", "They just asked for a solution. Go to beat 7 — the audit is now the obvious answer."],
          ["“Not really a priority”", "You got a real answer in six minutes. Log it, set a 60-day callback with fresh ranking data, move on."],
        ]),
        { k: "h", n: 7, t: "Bridge + offer — the audit, not the service" },
        SAY("“So you're at #[rank] for [search term]. The top three get most of the calls on that search. Every day you're below them those calls go to a competitor — and what's holding you back is fixable. That's what the audit lays out.”"),
        SAY("“I'll run the full audit — Maps, website and mobile — ranked by what moves your ranking fastest. No cost, no commitment. I can run it right now so it's in your inbox before we hang up, then we take 30 minutes to walk through it together. Sound good?”"),
        WHY("We sell the AUDIT, not the retainer: it's free, verifiable on their own phone, and makes the next conversation about a plan they've already seen instead of a price."),
        { k: "h", n: 8, t: "Close" },
        NOTE("Always exactly one next step."),
        ACTION(["Run the audit live and book the walkthrough."]),
        SEE("close", "🧾 Run their audit live — before you book anything", "Every line and every click"),
        SEE("call2", null, "The walkthrough itself"),
      ],
    },
    {
      id: "call2", tab: "Call 2 — walkthrough", title: "Call 2 — the audit walkthrough",
      sub: "This is where the money is. Call 1 sold the audit; this one sells the work. They've now seen their own numbers, so you are not persuading a stranger — you're helping someone act on something they already believe.",
      blocks: [
        WHY("🔑 Splitting the sale across two calls is a STRUCTURAL advantage, not a delay. Call 1 asks for something free and easy to say yes to. By the time price comes up they have watched a video, taken a call, and read an audit about their own business — three small commitments, all theirs."),
        DONT("Do NOT re-run the discovery from call 1. Re-asking what a customer is worth tells them you weren't listening the first time, and it's the fastest way to lose authority in a walkthrough."),
        { k: "h", n: 1, t: "🎥 Before you join — how you appear on the call" },
        WHY("This one is on camera, and how you look on a video call moves trust before you speak. The instinct that reads a stranger as safe or not is ancient and it does not switch off because the stranger is on a screen. Same threat response that decides how your OPENER lands (Guard & tone), just visual."),
        BRANCH([
          ["Sit back so they see your torso and hands", "A face filling the frame with hands out of shot reads, subconsciously, as someone concealing something. Give them a view from about the chest up and let your hands be visible when you talk."],
          ["Real background, not blurred or fake", "A blurred or virtual background is a hidden environment, and a hidden environment is one more thing to be wary of. A plain real wall beats a fake office every time."],
          ["Camera at eye level, lit from the front", "Below eye level is unflattering and looks improvised; backlit makes you a silhouette. A window or lamp in FRONT of you, not behind."],
          ["Their audit on screen, your face still visible", "Share the audit but keep your camera on. They are deciding about YOU, not a document — a disembodied voice over a spreadsheet is a worse sale."],
        ]),
        DONT("Don't join late, don't be still setting up when they arrive, and don't read the audit off a second screen you keep glancing at. All three say this is routine to you, when for them it is their business."),
        { k: "h", n: 2, t: "Re-anchor to THEIR words — first 20 seconds" },
        SAY("“Last time you said a customer's worth about [$X], and this had been going on [their timeframe]. That's what I had in mind going through this.”"),
        WHY("Their number, their timeframe, quoted back. Everything that follows is now measured against a standard they set, so there's nothing to argue with."),
        { k: "h", n: 3, t: "Walk the audit — findings in priority order" },
        NOTE("Go in the order the audit ranks them — what moves the ranking fastest, first. Do not editorialise and do not add features. If a finding doesn't connect to something they told you on call 1, say it quickly and move on."),
        DONT("No pitching in this section. You are reading a diagnosis, not making a case. The moment it turns into a pitch you've re-created the resistance the audit exists to avoid."),
        SAY("Per finding — “Here's what's happening, here's why it matters for [search term], here's what fixing it does.” Then pause and let them react."),
        { k: "h", n: 4, t: "Consequence, second pass — now it's evidence" },
        SAY("“Given what we just went through, what do you reckon that's been costing you?”"),
        WHY("Same question as call 1, but now it lands on findings they've just seen rather than on a guess. This is the highest-yield moment in the entire two-call sequence — they price it themselves, twice, and the second number is the one they believe."),
        DONT("Don't answer it for them. Silence."),
        { k: "h", n: 5, t: "Commitment — BEFORE the number" },
        SAY("“So — is this something you want handled for you, or something you'd rather take on yourselves?”"),
        WHY("Another safe-no. If they say they'll do it themselves, that's a real answer and the audit was still worth delivering — they may well be back. If they want it handled, they have just asked you to sell to them, and price becomes logistics instead of a hurdle."),
        BRANCH([
          ["“I want you to do it”", "Go to beat 5. Do not add anything. Do not re-sell."],
          ["“I'll have a go myself”", "“Fair enough — the audit's yours either way, it's in order of priority.” Log it, 90-day callback. Don't fight it."],
          ["“What does it cost?”", "They just closed themselves. Straight to beat 5."],
        ]),
        { k: "h", n: 6, t: "Price — say it, then STOP" },
        SAY("“It's $1,250 to get set up — profile, listings, site fixes and tracking — then $625 a month for the ongoing work. No contract, cancel whenever.”"),
        DONT("🔴 Do not keep talking after the number. Do not justify it, do not stack more value on top, do not fill the pause. Whoever speaks first loses this beat — and it is almost always the rep."),
        SAY("If they hesitate — “And if you'd rather not pay setup up front, the 3-month plan is $2,500 all in. Works out cheaper and it's still not a lock-in.”"),
        NOTE("Every number here is in the Pricing tab and on the live site. Never quote from memory."),
        SEE("price", "How to present it", "Exact prices"),
        { k: "h", n: 7, t: "Mechanics — say PORTAL, not “I'll email a contract”" },
        SAY("“I'll set your account up now. You'll get portal access and the agreement will be waiting there to sign.”"),
        WHY("Say portal because that is what actually happens. “I'll email you a contract” describes a different process and creates a mismatch the moment they get the real thing."),
        DONT("Don't email a contract yourself and don't take card details on the call. Use the admin flow — it's what creates the portal record everything else hangs off."),
        { k: "h", n: 8, t: "Lock the follow-through" },
        SAY("“If you haven't signed by [day] I'll give you a nudge.”"),
        NOTE("Then log the outcome before you dial the next number. An unlogged close is a close nobody else can see."),
      ],
    },
    {
      id: "offer", tab: "What we sell", title: "What we sell",
      sub: "The answers to “what do you actually do?”, “what will I get?” and “what happens if I say yes?”. Every number here is copied from the LIVE site — never quote from memory.",
      blocks: [
        { k: "h", n: 1, t: "The three things we do" },
        BRANCH([
          ["Google Maps local SEO", "Map-pack ranking, category relevance, service-area refinement, trust signals."],
          ["Google Business Profile", "Profile architecture, primary + secondary categories, posts/media, profile-to-site conversion."],
          ["Website support", "Money-page depth, local copy, on-page relevance, call/form flow and trust elements."],
        ]),
        NOTE("Base scope per deal: 1 GBP location, 2 core keywords + 1 rotating keyword, tracked on a 9×9 grid. Extra locations are +$500/mo. Say the scope out loud — a vague scope is what causes month-3 arguments."),

        { k: "h", n: 2, t: "🎯 The FIVE problems we actually solve — know these cold" },
        WHY("You are not selling Google Maps rankings. You are solving five specific problems, and every prospect has at least three of them. Learn the problem list and the diagnosis question for each — then you are never fishing on a call, you are checking which of five things is true."),
        { k: "table", head: ["#", "Their problem, in their words", "The question that surfaces it"], rows: [
          ["<b>1</b>", "<b>“Nobody finds us.”</b> They're not in the top three of the map for the searches that actually bring customers, so the phone doesn't ring — and they can't see it happening.", "“When someone searches [search term], any idea where you land?”"],
          ["<b>2</b>", "<b>“Google doesn't know what we do.”</b> Wrong or missing categories, a service area that's too narrow or too wide, no photos or posts. Google can't show you for work you'd happily take.", "“Which services actually make you the most money — and would Google know that from your listing?”"],
          ["<b>3</b>", "<b>“Our details are wrong all over the internet.”</b> Old address, an old phone number, a name spelt three ways. Every mismatch chips at the trust signal that decides ranking.", "“Have you ever moved or changed your number?”"],
          ["<b>4</b>", "<b>“People visit the site and don't call.”</b> The clicks they do get land somewhere slow, hard to use on a phone, or with no obvious way to call — so traffic arrives and leaves.", "“When someone lands on your site on their phone, what's the easiest thing for them to do next?”"],
          ["<b>5</b>", "<b>“I have no idea what's working.”</b> No baseline, no rank tracking, no call attribution. They've paid for SEO before and got charts instead of phone calls, so they can't tell effort from results.", "“How do you know today whether your marketing is working?”"],
        ]},
        NOTE("Note what 1–5 map to: profile · categories · listings · website · tracking. That is exactly what we sell, in the order we fix it. The offer isn't a service list — it's the answer to this problem list."),
        WHY("🔴 Problem 5 is the one that closes. The other four are technical and they half-know them. Number five is the one that made them stop trusting agencies — and being the people who show them the baseline first, then the same measurement every month, is what makes us different from whoever burned them."),
        DONT("Don't recite all five on a call. Ask the diagnosis questions, let them name the two or three that are true for them, and talk only about those. Naming a problem they don't have costs you credibility on the four you got right."),
        { k: "h", n: 3, t: "“So what is it you do?” — the answer depends on WHEN they ask" },
        WHY("🔑 A long answer here is a PRESENTATION delivered at minute one, and that is what manufactures resistance. The answer is never a presentation — it's one breath, then a question. If you finish and they're silent, you did it wrong: you just made them the judge and you the defendant."),
        SAY("EARLY, as a screen (“who is this, what do you do?”) — “We get local businesses showing up on Google Maps when someone nearby searches for what they do. For you that'd be [search term] — that's actually how I found you, you're sitting at #[rank]. Do you know where you come up on that?”"),
        WHY("Outcome in their customer's language, then proof we did homework on THEM, then a question most owners genuinely can't answer. Being that specific in sentence two is something almost nobody else cold-calling them can do — it's the whole advantage of having made the video."),
        SAY("If they're busy or short, cut it to the bone — “Google Maps — getting you into the top three when someone searches [search term] near you. That's it.”"),
        SAY("MID-CALL, genuinely interested — “Three parts. First your Google profile — categories, service area, the stuff that decides whether Google even shows you for [search term]. Then your listings, so your name, address and number match everywhere — mismatches are the most common thing quietly holding a business down. Then the page people land on when they do click, so the calls actually happen. Rank first, then convert. Which of those sounds weakest on your end?”"),
        WHY("Given in order, because the order IS the logic. And it still ends on a question — one that doubles as the beat-4 solution question."),
        SAY("If they ask what it's called — “Local SEO is the industry name, but that word's been ruined by people selling reports and no phone calls. What it actually means is Google Maps.”"),
        DONT("Never “we're a digital marketing agency” (vague, and the exact phrase every spam call opens with) · never lead with “SEO” (it's the word the last agency used before vanishing) · never list more than three things (a longer list just gives them more surfaces to say “got that covered”) · never “we help businesses like yours grow” (says nothing) · never end on a full stop — every version above ends on a question."),
        NOTE("“What am I paying for?” is a DIFFERENT question — that's the week-by-week below. The common error is answering that one when they only asked who you are."),

        { k: "h", n: 4, t: "What they should expect — and by when" },
        { k: "kpi", items: [["20–40%", "3-pack visibility lift after foundation cleanup"], ["15–30%", "map profile actions — calls, clicks, directions"], ["10–25%", "lead conversion lift"]] },
        NOTE("First measurable movement: 30–60 days once setup completes. These three figures are on the live homepage — they are the ONLY result numbers you may quote."),
        DONT("Never guarantee #1, a rank position, or a lead count. Refusing is a TRUST move — every one of these people has been promised #1 before, by someone who then vanished."),
        SAY("If pushed for a guarantee — “I won't promise you a position, because nobody controls Google. What I will do is show you the baseline today and the same measurement every month, so you can see the movement yourself.”"),

        { k: "h", n: 5, t: "Month 1, week by week" },
        { k: "table", head: ["Week", "What lands"], rows: [
          ["Week 1", "Audit, baseline capture, category + profile structure fixes"],
          ["Week 2", "Listing consistency cleanup + trust signal foundation pass"],
          ["Week 3", "Website relevance + conversion-path updates go live"],
          ["Week 4", "Tracking baseline + Month 2 action roadmap delivered"],
        ]},
        WHY("Answering “what happens first?” with a week-by-week beats any adjective. It also sets the expectation that month 1 is foundation, which protects you at the month-2 check-in."),

        { k: "h", n: 6, t: "They say yes — exactly what happens next" },
        BRANCH([
          ["1. You send the agreement", "In admin: open their client record → Send contract for signature. NOT from your own inbox."],
          ["2. They sign in their portal", "They get a “Sign your service agreement” banner in the client portal — no PDF chasing."],
          ["3. Kickoff", "Week 1 work starts: audit, baseline, category + profile fixes."],
          ["4. Log the outcome", "Set the Airtable Call Outcome before you dial the next number."],
        ]),
        SAY("“I'll send the agreement over — you'll get it in your portal, sign it there, and I start on the audit and profile work this week.”"),
        DONT("Don't email a contract yourself and don't take card details on the call. The admin flow is what creates the portal record everything else hangs off."),
      ],
    },
    {
      id: "obj", tab: "Objections", title: "Objections",
      sub: "Same shape every time: CLARIFY → discuss → reframe → one small ask. Never argue, never bad-mouth an incumbent.",
      blocks: [
        WHY("Reps who handle objections well close at up to 64%. An objection is usually the first honest thing they've said."),
        WHY("🔑 CLARIFY FIRST — always. The objection they say is rarely the objection they have. “That's more than we wanted to spend” often means “I have the money, I just don't see why it's worth it” — a completely different conversation needing the opposite answer. Answering the stated objection instead of the real one is the single most common way these calls die."),
        NOTE("The clarifier is nearly always the same sentence: “When you say [their exact words] — what do you mean by that?” Say it curious, not defensive. Then let them explain."),
        { k: "h", n: 1, t: "🧠 Then LOG it — which Airtable category each one is" },
        WHY("We never record calls, so the Call Objection field is the ONLY place the content of a call survives. It's what lets the system say “the same three objections killed 60% of calls this week” instead of just “your connect rate is 22%”. The console asks for it on Not interested and Connected — two seconds, highest-value tap in the whole tool."),
        { k: "table", head: ["They said…", "Log it as"], rows: [
          ["“I already have someone doing SEO” · “my nephew does it”", "<b>Already has SEO/agency</b>"],
          ["“That's too expensive” · “what does it cost?” then balks", "<b>Too expensive</b>"],
          ["“I'm too busy” · “call me next quarter” · “just send an email”", "<b>No time / call back later</b>"],
          ["“We're getting plenty of calls already”", "<b>Happy with current results</b>"],
          ["“I'd have to ask my partner/boss”", "<b>Not the decision-maker</b>"],
          ["“Does SEO even work?” · “can you guarantee #1?” · “I got burned”", "<b>Doesn't believe it works</b>"],
          ["“No budget this year”", "<b>No budget right now</b>"],
          ["Anything that fits none of the above", "<b>Other</b>"],
        ]},
        NOTE("“Skip” still logs the outcome — never lose a complete outcome record chasing a nice-to-have field. But skip it rarely: a blank here is a call we learn nothing from."),
        { k: "obj", q: "“What does it cost?” — asked early", a: [
          SAY("“Fair question — setup's $1,250 one-off and $625 a month, no contract. But do the free audit first so you can see exactly what you'd be paying me to fix. No sense talking price before you've seen the plan.”"),
          NOTE("Answer straight, THEN redirect. Dodging price reads as expensive."),
        ]},
        { k: "obj", q: "“That's too expensive”", a: [
          SAY("Clarify — “When you say too expensive — is it more than you'd budgeted, or is it that you're not sure it'll pay back?”"),
          WHY("🔑 Those two answers need OPPOSITE responses and we used to give the same one. Budget → offer the 3-month plan. Doubt → their own consequence number, which they already said out loud earlier in the call."),
          SAY("Reframe — “You said a customer's worth about [$X]. At $625 a month this pays for itself with one extra customer; everything after that is yours. If it never delivers that, you cancel — there's no contract.”"),
          WHY("Anchor to REVENUE, never to cost. “Expensive” is meaningless until it's set against what one customer is worth."),
        ]},
        { k: "obj", q: "“I already have someone doing SEO”", a: [
          NOTE("This should now be RARE — beat 4 of the call surfaces it as context long before it can become an objection. If it lands here anyway, you skipped beat 4."),
          DONT("Don't criticise them — it insults the buyer's judgement. They hired the incumbent."),
          SAY("Clarify — “How long have they been on it?” … then “What have you seen change since they started?”"),
          WHY("Then say NOTHING and let the answer land. If it's working we lose honestly and fast, which is fine. If it isn't, THEY just said so — worth more than any comparison you could draw, and it keeps you clear of the never-criticise-an-incumbent rule."),
          SAY("“Good — then this is a free second opinion. If they've got it handled the audit confirms it and you can send it on. If there are gaps, you'll know what to ask. Either way you're better off.”"),
        ]},
        { k: "obj", q: "“I'm too busy right now”", a: [
          SAY("“Understood — that's exactly why the audit's free and needs nothing from you. I'll send it, you look when you've got five minutes, and if it's not useful you've lost nothing.”"),
          NOTE("Log Callback scheduled + set Next Action Date. “Busy” is almost never a no."),
        ]},
        { k: "obj", q: "“Just send me an email”", a: [
          SAY("“Will do — I'll text you the link right now so it doesn't get buried. Is this the best number?”"),
          WHY("Send it WHILE you're on the phone. “Send me an email” is usually a soft exit; texting it in front of them converts far better."),
        ]},
        { k: "obj", q: "“Does SEO work?” / “Can you guarantee #1?”", a: [
          SAY("“No — and anyone who guarantees a #1 spot is lying, because nobody controls Google's ranking. What I can show you is exactly where you rank now across your whole service area and what's holding you back. You can verify all of it yourself.”"),
          WHY("Refusing to guarantee is a TRUST move. They've been promised #1 before — being the one who won't is memorable."),
        ]},
        { k: "obj", q: "“I got burned by an agency before”", a: [
          SAY("Acknowledge — “That's common, and it's usually the same story: twelve-month contract, monthly report full of charts, no more phone calls. What happened with yours?”"),
          SAY("Differentiate on STRUCTURE — “That's exactly why we're month-to-month. If it isn't working you leave. We have to earn the next month, every month.”"),
        ]},
        { k: "obj", q: "“My nephew / a mate does it”", a: [
          SAY("“Then the audit's genuinely useful to them — it's a checklist of what to fix, in order. Send it on. If it's more than they've got time for, you know where I am.”"),
          NOTE("Never make them choose between you and family. You'll lose."),
        ]},
        { k: "obj", q: "“Send me case studies / who else do you work with?”", a: [
          SAY("“I'd rather show you your own numbers than someone else's. The audit is your listing, your area, your competitors — a better test of whether I know what I'm doing than a testimonial you can't verify.”"),
          DONT("NEVER invent a case study or client name. One fabricated claim is a legal problem, not just a lost sale."),
        ]},
        { k: "obj", q: "“Not interested” — flat, immediate", a: [
          SAY("One attempt — “No problem. Can I ask: is Maps handled already, or just not a priority this year?”"),
          BRANCH([["They answer", "You're back in a conversation. Take it."], ["Still no", "“All good — I'll check back in a couple of months with fresh ranking data.” Log Not interested."]]),
          DONT("Don't push a third time. It costs you the callback in 60 days, which is worth more than this call."),
          DONT("🔴 Do NOT use a consequence question here (“so what happens if it stays like that?”). Aimed at someone who has already said no, that stops being a question and becomes pressure. It's the one move that would cost us a reputation in a city this small — and one clean no beats one bad story."),
        ]},
        { k: "obj", q: "“Take me off your list” / hostile", a: [
          SAY("“Of course — I'll take you off now. Sorry to have bothered you.”"),
          NOTE("Log Do not call IMMEDIATELY. No last pitch, no exceptions. Legal and reputational."),
        ]},
        { k: "obj", q: "“I need to think about it” / “talk to my partner”", a: [
          SAY("Clarify — “Makes sense. What's the bit you're weighing up — whether it works, or whether now's the right time?”"),
          SAY("Diffuse — “Suppose the audit shows it's mostly fixable. Would you want it done, or would you still want to sit on it a while?”"),
          WHY("Diffuse with a hypothetical, never with facts. It lets them move without having to admit they were wrong about anything — which is the actual barrier, not the information."),
          SAY("“I'll send the audit so you've both got something concrete. Shall I call you [day] once you've had a look?”"),
          WHY("ALWAYS attach a date. “I'll think about it” without one is a polite no."),
        ]},
      ],
    },
    {
      id: "price", tab: "Pricing", title: "Pricing",
      sub: "Know these cold. Quoting a wrong number in front of a prospect is unrecoverable.",
      blocks: [
        { k: "table", head: ["Item", "Was", "Now (50% off)", "Note"], rows: [
          ["<b>Setup</b>", "$2,500", "<b>$1,250</b>", "One-time, month 1 only"],
          ["<b>Monthly</b>", "$1,250", "<b>$625/mo</b>", "Month 2 onward"],
          ["<b>3-month plan</b>", "—", "<b>$2,500 total</b>", "Saves $625 · optional, not a lock-in"],
          ["<b>Month-to-month</b>", "—", "<b>$1,875</b> month 1", "Setup + first month, cancel anytime"],
          ["<b>Website build</b>", "$1,500 / $3,500", "<b>$750 / $1,750</b>", "Optional, separate"],
        ]},
        DONT("NEVER say “$2,500 a month” or “$1,250 a month.” That was an older structure and it's wrong. It's $1,250 once, then $625 a month."),
        { k: "h", n: 1, t: "How to present it" },
        SAY("“It's $1,250 to get set up — profile, listings, site fixes and tracking — then $625 a month for the ongoing work. No contract, cancel whenever.”"),
        SAY("If they hesitate — “And if you'd rather not pay setup up front, the 3-month plan is $2,500 all in. Works out cheaper and it's still not a lock-in.”"),
        { k: "h", n: 2, t: "What's included" },
        NOTE("Month 1: profile audit + category fix, listings cleaned up, website relevance + conversion fixes, tracking. Every month after: ongoing profile work, ranking across your service area, reviews, site improvements, and a report showing calls, forms and rank. Everything's included — the only separate item is an optional website build."),
      ],
    },
    {
      id: "close", tab: "Close & log", title: "Close & log",
      sub: "Every call ends with exactly one next step, and gets logged before you dial again.",
      blocks: [
        { k: "h", n: 1, t: "🧾 Run their audit live — before you book anything" },
        SAY("“I'm going to run your audit right now so it's in your inbox before we hang up. What's the best email? Spell it for me.”"),
        ACTION([
          "Open rocketgrowthagency.com/free-growth-audit in a new tab.",
          "Fill in their name, business name and website from the lead card — confirm each one out loud.",
          "Type the email as they spell it, then read it back to them letter by letter.",
          "Press submit.",
        ]),
        WHY("Never send them the link to fill in themselves. They have to open your email, click, and then finish a form most people abandon — roughly one prospect in four gets there. You pressing submit gets all of them. Reading the email back catches the typo that sends their audit nowhere: 8–24% of emails typed into forms are wrong."),
        SAY("“Open your email — tell me when you see it from Rocket Growth Agency.”"),
        ACTION([
          "Not there in 60 seconds: ask them to check spam and Promotions, then submit again.",
          "Driving or on a job site: still submit. Tell them it'll be in their inbox when they stop, and go straight to booking.",
        ]),
        SAY("“Scroll to the map. What number is it showing for [search term]?”"),
        WHY("One number, read out in their own voice, makes the problem theirs. A small act people do themselves is what makes them keep an appointment — patients who wrote their own appointment card missed 18% fewer. Stop at one number: walking the audit is Call 2."),
        { k: "h", n: 2, t: "📅 Book the walkthrough — WHILE they're on the phone" },
        WHY("This is the close of call 1, and it is where bookings are lost. “I'll send you something” means you hang up with nothing. Booking it live means they watch the invite arrive — and it costs you thirty seconds."),
        NOTE("🔧 TOOL: <b>Google Calendar + Google Meet</b>. Already paid for with Workspace (hello@rocketgrowthagency.com), the Meet link generates itself, and the invite comes from a domain they can verify. No Calendly, no extra subscription."),
        SAY("“That's what we'll go through together — 30 minutes. I've got [Thursday 2pm] or [Friday 10am]. Which suits?”"),
        WHY("Two named times, 1–3 business days out, never more than 5. Show rate is about 81% for a meeting one day out and about 60% by two weeks."),
        SAY("Then, typing — “Perfect, putting that in now.”"),
        ACTION([
          "calendar.google.com → click the slot, or press C. Do it while they're talking — five seconds of silence sounds like someone being organised.",
          "Title: “Rocket Growth Agency — Google Maps audit walkthrough: [business name]”. Their business name is what stops it looking like spam.",
          "Set it to 30 minutes.",
          "Click “Add Google Meet video conferencing”. Check the invite shows a Join by phone number as well as the Meet link.",
          "Add their email as a guest — the one they just spelled.",
          "Description — paste: “We'll walk through your audit: where you show on the map, who's ranking above you, and what's fixable. Join on your computer or phone so you can see your map — camera optional. On a job site? I'll call you at [their number] at the start time.” Then their /v/ video link from the lead card.",
          "Save → “Send invitation” → yes, email the guest.",
        ]),
        SAY("“Sent. Can you hit Yes on the invite for me? Easiest is you join from your computer or phone so you can see your map on my screen. If you're out on a job, no problem — I'll call this number at [time].”"),
        WHY("Accepting it while you're on the line proves the email works, proves it didn't go to spam, and makes the meeting real. The map on screen is the strongest thing we have — but saying the phone backup out loud means a job site is never a reason to miss it."),
        SAY("Then close the loop — “So that's [day, time] on the Meet link in your email, and if you're not on by [time] I'll ring this number. Is that still the best one for you?”"),
        DONT("Don't say “I'll send you a calendar invite” and move on. Don't offer “whenever suits you” — an open question makes them do work and they'll pick nothing. Two named times, always."),
        { k: "h", n: 3, t: "📲 Reminders — text, then call if they don't join" },
        ACTION([
          "Log the outcome as Callback scheduled with the walkthrough date as the Next Action Date.",
          "About 24 hours before, text from the Quo app on (424) 242-2040: “[first name], confirming tomorrow [time] for your Google Maps audit walkthrough. The Meet link's in your email, or I'll call you. Reply C to confirm.”",
          "1–2 hours before, text: “See you at [time]. Link's in your email. On a job? Just pick up when I call.”",
          "Start time + 2 minutes and they haven't joined: call their number and run the walkthrough from the audit in their inbox.",
          "No answer: text the same day with two new times inside 48 hours.",
        ]),
        WHY("Any reminder beats none — across 8 trials a text reminder took attendance from 68% to 79%, and a reminder call did no better than the text. The call at +2 minutes goes to them instead of waiting for them to click a link, which is why phone appointments are missed far less often than video ones."),
        { k: "h", n: 4, t: "If they won't pick a time" },
        SAY("“No problem — the audit's in your inbox, have a look when you've got five minutes. Shall I call you [day] to walk through it?”"),
        NOTE("That's a callback, not a booking. Log it as <b>Callback scheduled</b> with the date — the console will prompt you for it, and it puts them in the Scheduled tab instead of leaving them floating."),
        DONT("Don't book a meeting they didn't agree to and don't put a hold in their calendar. Both read as pushy and the no-show rate on a time you chose for them is close to total."),
        { k: "h", n: 5, t: "Before the walkthrough — 5 minutes of prep" },
        BRANCH([
          ["Have the audit open and ready to share", "Not open-it-while-they-watch."],
          ["Re-read your call-1 notes", "Specifically the number they gave for what a customer is worth, and how long the problem has been going. You will quote both back in the first 20 seconds."],
          ["Pull their live rank again", "If it moved since the video, say so — it proves the measurement is real and ongoing, not a one-off screenshot."],
        ]),
        SEE("call2", "🎥 Before you join — how you appear on the call", "How you appear on camera"),
        SEE("call2", null, "The walkthrough itself — read before the meeting, not during"),
        { k: "h", n: 6, t: "They said yes — do this, in this order" },
        NOTE("The FGA has done its job. Do NOT offer or complete an audit after a yes — switching into audit mode stalls a live close."),
        SAY("“Good — let's get you started.”"),
        WHY("Take the yes and stop selling. The most common mistake here is adding one more feature to someone who already agreed."),
        SAY("“So you know exactly what you're getting: one Google Business Profile location, two core keywords plus one rotating, and the 9×9 geo-grid so you can see your rank across the whole service area. Extra locations are $500 a month each if you add them later.”"),
        WHY("Say the scope OUT LOUD every time. A vague scope is what causes month-3 arguments about what was included."),
        NOTE("Say the number, then STOP TALKING. The silence after the number is the close."),
        SEE("price", "How to present it", "The price, word for word"),
        SAY("“Here's what happens next. I'll set your account up now while we're on the phone — I've got your email as [email], that right? You'll get access to your portal, and the agreement will be sitting there waiting for you to sign. As soon as it's signed we kick off.”"),
        WHY("Say PORTAL, not “I'll email you a contract.” That is what actually happens, and it sets the expectation correctly so they know where to look."),
        SAY("“I'll watch for it come through. If you haven't signed by [day], I'll give you a quick nudge — sound fair?”"),

        { k: "h", n: 7, t: "“I don't want a 3-month agreement / no contract”" },
        NOTE("There is no lock-in to remove. Month-to-month IS the default. The 3-month plan is a DISCOUNT, not a commitment."),
        SEE("price", null, "The plans side by side"),
        SAY("“You're not signing up for three months — we're month-to-month either way. That's the point: we have to earn the next month, every month.”"),
        SAY("“There's no commitment — you can cancel any month. There's still a service agreement so we both know exactly what's included and what you're paying. Takes a minute to sign.”"),
        WHY("“No contract” in our pitch means NO LOCK-IN — never “no paperwork”. The agreement defines scope and payment terms, and it is what creates the portal record that onboarding, billing and their dashboard all hang off. There is no path that skips it."),

        { k: "h", n: 8, t: "How the contract actually gets sent" },
        { k: "table", head: ["#", "Step", "Detail"], rows: [
          ["1", "<b>Create the client record</b>", "In admin, first — the contract is generated against an existing client and cannot be sent without one"],
          ["2", "<b>Send contract for signature</b>", "Client record → the button. Picks the plan and any add-ons"],
          ["3", "<b>They sign in the portal</b>", "Via the “Sign your service agreement” banner"],
          ["4", "<b>Kickoff</b>", "Then set the Airtable Call Outcome"],
        ]},
        DONT("Don't email a contract yourself and don't take card details on the call. The admin flow is what creates the portal record everything else hangs off — send it manually and none of that exists."),
        NOTE("The agreement is built from a fixed per-plan template — no AI on legal text — so the same plan always produces identical wording. Only name, date, price and add-ons change."),

        { k: "h", n: 9, t: "The four ways a call ends" },
        BRANCH([
          ["Booked", "“So that's [day, time] on the Meet link in your email, and if you're not on by [time] I'll ring this number.” See §2."],
          ["Soft yes", "Run the audit live (§1), then “I'll check in [day].” Set a Next Action Date — no date means it never happens."],
          ["No", "“All good — I'll check back in a couple of months with fresh ranking data.” Leave it warm."],
          ["Do not call", "Log immediately. No follow-up, ever."],
        ]),
        { k: "h", n: 10, t: "Log it — Airtable “Call Outcome”" },
        { k: "table", head: ["Outcome", "When", "Then"], rows: [
          ["<b>Connected</b>", "Spoke to the owner", "Add a note on what they said"],
          ["<b>Callback scheduled</b>", "They named a time", "Set Next Action Date"],
          ["<b>Interested</b>", "Wants the audit", "Run it live on the call — §1"],
          ["<b>Left voicemail</b>", "No answer, VM left", "Text immediately"],
          ["<b>No answer</b>", "No VM", "Retry a different time of day"],
          ["<b>Not interested</b>", "Clear no", "Back into the 60-day pool"],
          ["<b>Wrong number</b>", "Not the business", "Fix the record"],
          ["<b>Do not call</b>", "They asked", "Suppress permanently"],
        ]},
        NOTE("Calls auto-log via the Quo webhook, but the OUTCOME is yours to set — it drives the callbacks-due list and the daily digest."),
      ],
    },
    {
      id: "train", tab: "Training", title: "Training a new rep",
      sub: "Nobody dials a real lead until they've passed certification. The fastest way to burn a lead list is an untrained rep on it.",
      blocks: [
        { k: "h", n: 1, t: "Which of the four are you?" },
        WHY("A useful way to place yourself, because the difference in earnings between reps selling the same thing at the same price is almost entirely skill, not luck or leads."),
        BRANCH([
          ["The winger", "Says something different on every call. No process, so no idea why anyone buys or doesn't. When it goes badly it's the leads' fault, the prospect's fault, the market's fault — never the skill. Doesn't last."],
          ["The dabbler", "Reads a bit, watches a bit, believes enough reps will eventually make them good. It might, in a decade. Meanwhile they grind hours to hit numbers and burn out. This is where most people sit."],
          ["The know-it-all", "Trained hard once, got good, then stopped. Income flattens exactly where the learning stopped. The tell is treating a script as beneath them."],
          ["Committed to mastery", "Still training after it's working, because skill is the one variable they control. Learns from other people's mistakes instead of paying for their own."],
        ]),
        NOTE("The point isn't self-flattery. If you can't say WHY the last call went the way it did, you were winging it — and that is fixable in an afternoon with these tabs."),
        { k: "h", n: 2, t: "Ramp — 30 / 60 / 90" },
        BRANCH([
          ["Week 1 — foundation", "Offer and pricing cold. Read this end to end, Sales brain tab first. Look up 20 local businesses and find their Maps rank. Sit in on 5 live calls on speaker — we do NOT record (see Sales brain §4), so listening in is the only way to hear a real one."],
          ["Weeks 2–4 — practice", "Drills daily. Certification at end of week 2. Once passed: voicemails and callbacks only."],
          ["Days 31–60 — live + coaching", "Full queue. Every call scored week one, then two a day. Review the WORST call weekly, not the best."],
          ["Days 61–90 — autonomy", "Own the queue. Self-score two calls a week. Coaching moves to deal strategy."],
        ]),
        { k: "h", n: 2, t: "Drills — practise moments, not whole calls" },
        NOTE("Whole-call role-play wastes time. Drill the five moments that decide calls, five minutes each, until automatic:"),
        BRANCH([
          ["The opener", "Ten times, until it doesn't sound read."],
          ["Price pushback", "“Too expensive” → reframe to revenue."],
          ["“Send me an email”", "Convert to a text, on the call."],
          ["Competitor mention", "“I've got a guy” → free second opinion."],
          ["The booking", "Two named times, then repeat it back."],
        ]),
        { k: "h", n: 3, t: "Certification — score before going live" },
        { k: "table", head: ["Skill", "Evidence", "Score 1–4"], rows: [
          ["Opens with the reason for calling, no apology", "Mock call", ""],
          ["Asks the customer-value question and <b>waits</b>", "Mock call", ""],
          ["Quotes pricing correctly from memory", "Verbal check", ""],
          ["Handles “too expensive” by anchoring to revenue", "Drill", ""],
          ["Never bad-mouths an incumbent", "Drill", ""],
          ["Refuses to guarantee a #1 ranking", "Drill", ""],
          ["Closes with two named times and repeats back", "Mock call", ""],
          ["Logs the right outcome + Next Action Date", "Airtable", ""],
        ]},
        NOTE("1 = can't do it · 2 = does it when prompted · 3 = does it unprompted · 4 = could teach it. EVERY row must be 3+ before touching the live queue."),
        { k: "h", n: 4, t: "The non-negotiables" },
        DONT("Never: guarantee a ranking · invent a client or case study · quote a number you're unsure of · criticise a competitor · call anyone who asked not to be called · leave a call without a logged outcome."),
      ],
    },
    {
      id: "brain", tab: "Sales brain", title: "Sales brain — how the whole system fits together",
      sub: "The operating map. Why we win, what makes our sale structurally different, where every number comes from, and what the data can and cannot tell us. Read this once properly; the other tabs assume it.",
      blocks: [
        { k: "h", n: 1, t: "🏆 Why we win — the positioning" },
        NOTE("🔒 THE NORTH STAR (internal — never say it out loud): <b>“We prove it before we pitch it.”</b> Every competitor leads with a promise. We lead with evidence they can check themselves. That is the thread through everything below, and it is a literal description of the funnel, not a slogan."),
        DONT("Never actually SAY “we prove it before we pitch it” on a call. It's a strategy line, not a sentence a human says — a slogan out of a stranger's mouth sounds like marketing and puts the guard straight back up."),
        { k: "h", n: 2, t: "What you actually say — the spoken version" },
        SAY("“I'm not going to pitch you. I already looked up where [business] ranks for [search term] — you're sitting at #[rank]. I'll put the full breakdown together and send it over, no charge. If it's useful, we talk. If it's not, you've still got it.”"),
        WHY("Same idea, said like a person. It opens by removing the thing they're braced for (“I'm not going to pitch you”), proves we did the work before proving anything about ourselves, and makes the next step free and reversible. Every clause is something we actually do — nothing to walk back."),
        NOTE("Shorter version when they're busy — “I already looked up where you rank. I'll send you the breakdown free, and you can decide if it's worth a conversation.”"),
        DONT("Don't say “I'm not going to pitch you” and then pitch. If you say it, honour it for the rest of the call — that sentence is only worth anything because it's true."),
        BRANCH([
          ["We show up already knowing", "Everyone else opens with “tell me about your business.” We open with THEIR rank on THEIR search term, in a video we made before any contact. Almost nobody cold-calling them can be that specific in sentence two."],
          ["Verifiable, not claimed", "A 9×9 geo-grid of where they actually rank, checkable on their own phone. We hand over evidence before we ask for anything."],
          ["We refuse to guarantee #1", "The exact thing every agency that burned them did promise. Being the one who won't is memorable, and it's true."],
          ["Month-to-month by default", "We re-earn it every month. The 3-month plan is a discount, not a lock-in — so we carry the risk, not them."],
          ["A real audit, free, before any ask", "Not a lead magnet PDF. Their listing, their area, their competitors."],
        ]),
        DONT("Don't claim to be cheaper, don't claim to be bigger, and don't claim results we can't show. Our advantage is EVIDENCE and RISK — we prove it first and we don't tie them in. Those are the two things a burned owner actually cares about."),
        { k: "h", n: 3, t: "🔑 Two structural facts that make our sale different" },
        WHY("Most sales advice — including most of what you'll read or watch — assumes neither of these is true. Test anything new against them before adopting it."),
        BRANCH([
          ["The video persuades BEFORE the call", "They already watched, alone and with no one to resist, their own business ranking below competitors. The hardest part of any sale — getting someone to accept they have a problem — happened before you dialled. So don't re-do it: compress the early questions and start where the video left off."],
          ["Call 1 sells the AUDIT, not the retainer", "Any framework that assumes one call ending in a purchase has to be split in two. Price belongs on call 2, after they've seen their own findings. See the Call 2 tab."],
        ]),
        { k: "h", n: 4, t: "The three sales surfaces in this admin" },
        { k: "table", head: ["Surface", "What it's for", "When you use it"], rows: [
          ["<b>Calls</b>", "The queue and the dialer. Five tabs: To call · Scheduled · Interested · Attempted · Closed. One-click outcome logging, auto-advance.", "Every dialing session"],
          ["<b>Sales Playbook</b>", "This. Scripts, objections, pricing, the two call spines. Also opens as a drawer OVER the call card so the lead stays visible.", "Mid-call and for prep"],
          ["<b>Docs</b>", "The owner-economics and delivery PDFs — comp plans, close-rate models, the account-manager playbook.", "Planning and hiring, never mid-call"],
        ]},
        DONT("🔴 In Docs, <b>sales-rep-compensation.pdf</b> is OWNER ONLY — it shows margins and what the business keeps. <b>sales-rep-offer.pdf</b> is the candidate-safe version with every owner number stripped. Handing a candidate the wrong one hands over the negotiating position."),
        { k: "h", n: 5, t: "🔴 We do not record calls — and what replaces it" },
        WHY("California is a two-party-consent state, so recording a cold call requires a spoken disclosure on every single call. We deliberately stayed on the plan without recording. That is a legal choice, not a budget one — do not “fix” it."),
        NOTE("What it permanently rules out: wording-level coaching. “You said X, should have said Y” needs the words, and the words are never captured. Never promise that to a new rep."),
        NOTE("What replaces it: role-play against these tabs, plus the Airtable outcome log. Without recordings the outcome log is the ONLY evidence the system will ever have — which is why an unlogged call is worse than a lost one."),
        { k: "h", n: 6, t: "The Call Objection field — the one place call CONTENT survives" },
        NOTE("The console asks for it ONLY on <b>Not interested</b> and <b>Connected</b> — where a human spoke and it didn't close. Never on no-answer, voicemail, wrong number or do-not-call, because there's no objection there and an extra tap would tax every dial."),
        WHY("This is what lets the system say “the same three objections killed 60% of calls this week” instead of only “your connect rate is 22%”. It is the highest-value two seconds in the whole console."),
        NOTE("“Skip” still logs the outcome. Never force the category — a complete outcome record matters more than a nice-to-have field."),
        { k: "h", n: 7, t: "What the call brain can tell you" },
        NOTE("`node scripts/call-brain.mjs` in the Scraper repo — last 90 days. Add `--days=30 --write`, or `--selftest` to verify the maths."),
        BRANCH([
          ["When to call", "Connect rate by hour and weekday — usually the single biggest lever available."],
          ["Is the opener working", "Duration vs outcome. Connects dying under 30 seconds is an OPENER problem, not an offer problem."],
          ["When to stop dialing", "Attempts-before-connect distribution — tells you when persistence turns into waste."],
          ["Who to call", "Outcome by industry, Maps rank, and clicked-vs-opened."],
          ["Why you lose", "Call Objection counts, plus a pass over the rep's [call] notes."],
        ]),
        { k: "h", n: 8, t: "Where the numbers come from — never from memory" },
        DONT("🔴 Never quote a price, a result percentage or a timeline from memory or from a PDF. Prices live in one place and are quoted on seven pages; the three result figures are the ONLY ones on the live homepage and the only ones you may say out loud."),
        NOTE("Quoting a wrong number in front of a prospect is unrecoverable. If you're unsure, say “let me get you the exact figure” — that costs you nothing and a wrong number costs the deal."),
        { k: "h", n: 9, t: "🔁 How this playbook improves — the loop" },
        NOTE("Research → verdict (adopt / adapt / reject, and why) → test it against the two structural facts in section 2 → LAND IT IN THIS PLAYBOOK → measure it in the outcome log."),
        WHY("Step 4 is the one that gets skipped. A finding that never reaches these tabs has changed nothing, because on a live call you read the playbook — not a document. Until it lands here, it is a note, not a change."),
      ],
    },
  ];

  // ---------- renderer ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // [placeholders] get a tint so they're obviously fill-in-the-blank at a glance mid-call
  // <b> is the one tag the data may carry. esc() used to turn it into literal "<b>" text on every
  // Say/Note/Branch that bolded a word (51 of them) — only tables, which skip esc(), rendered it.
  const ph = (s) => esc(s).replace(/&lt;(\/?)b&gt;/g, "<$1b>").replace(/\[([^\]]+)\]/g, '<em class="pb-ph">[$1]</em>');

  // ============================================================================
  // GUIDED CALL — a decision tree for LIVE calls. The reference tabs above are for
  // training and prep; mid-call a rep should only ever see the next thing to say.
  //
  // Each node: what to SAY, the reasoning underneath, and 2-4 buttons for what the
  // prospect actually said. Clicking a reply opens the next node. `out` marks a
  // terminal node and names the Airtable Call Outcome to log.
  //
  // ⚠️ Every option MUST point at a node that exists. A dead end mid-call is worse
  // than no tree at all — the rep is left staring at a button that does nothing while
  // someone is talking. checkFlow() below asserts this at load.
  // ============================================================================
  const FLOW = {
    start: {
      t: "Warm lead — they got the video",
      b: [
        SAY("\u201cHey [first name], it's [name] at Rocket Growth Agency \u2014 I sent you a short video a couple of weeks back showing where [business] comes up on Google Maps. Did you get a chance to watch it?\u201d"),
        WHY("Never open by apologising. \u201cDid I catch you at a bad time?\u201d is the worst measured opener (~0.9%). Stating your reason is ~2.1\u00d7 better \u2014 and we have the best reason there is: a video we made for them."),
      ],
      o: [["\u201cYeah, I saw it\u201d", "saw"], ["\u201cDon't remember it\u201d", "recap"], ["\u201cNot interested\u201d", "obj_cold"], ["Voicemail / no answer", "vm"]],
    },
    saw: {
      t: "They watched it",
      b: [
        SAY("\u201cWhat stood out?\u201d"),
        WHY("Then STOP TALKING. What they say next is your whole call \u2014 they tell you the pain in their own words, which is far more persuasive than you naming it."),
        DONT("Don't fill the silence. If you talk first you have just replaced their reason with yours."),
      ],
      o: [["They named a problem", "dig"], ["Vague / \u201cit was interesting\u201d", "recap"], ["\u201cHow much is it?\u201d", "price"], ["\u201cI'm not interested\u201d", "obj_cold"]],
    },
    recap: {
      t: "⏱ 30-second version",
      b: [
        SAY("\u201cNo worries \u2014 30-second version: I looked up [business] for [search term] and you're showing at #[rank] on the map. The top three take most of the calls for that search, so I recorded exactly what's holding you back. Worth 90 seconds?\u201d"),
        WHY("Their real rank on their real search is the most persuasive thing in this playbook. Pull the lead card up while they talk \u2014 it has the search term and rank."),
      ],
      o: [["Interested \u2014 tell me more", "dig"], ["\u201cHow much?\u201d", "price"], ["Objection", "obj_hub"], ["\u201cNot interested\u201d", "obj_cold"]],
    },
    dig: {
      t: "Go deeper — duration, then cause",
      b: [
        SAY("“How long do you reckon it's been sitting like that?”"),
        SAY("Then — “What do you think's causing it?”"),
        WHY("Curious tone. Duration and cause are what turn an interesting fact into a problem they OWN — and a problem they diagnosed themselves is one they can't argue with later."),
        NOTE("Their answer to “what's causing it” tells YOU which call this is: bad luck, a bad agency, or their own neglect are three different conversations."),
        DONT("Don't correct a wrong guess. Someone who says “top five” and sits at #12 has just handed you the whole call."),
      ],
      o: [["They explained it", "tried"], ["“No idea”", "tried"], ["Blames an agency they use", "tried"], ["“How much is it?”", "price"]],
    },
    tried: {
      t: "What have they already tried?",
      b: [
        SAY("“Have you tried to do anything about it?” … then “How did that go?”"),
        WHY("This is where “I've already got someone”, “my nephew does it” and “I got burned before” come out. Asked HERE they're context you can use. Unasked, the same facts come back as objections at the end, when they cost you the deal."),
        DONT("Don't react when they name an incumbent. Don't compete, don't criticise, don't start selling against them. Note it and move on."),
      ],
      o: [["Tried nothing", "cost"], ["Has someone on it", "cost"], ["Tried and it failed", "cost"], ["“I got burned before”", "obj_burned"]],
    },
    cost: {
      t: "Make them price it — the biggest question in the call",
      b: [
        SAY("“Roughly what's a new customer worth to you?”"),
        SAY("Then — “And if the top three are taking most of those calls, what does that cost you over a year?”"),
        WHY("⭐ Concerned tone, lean in. They price their own pain — more persuasive than anything you assert, and you'll never have to defend the number because it's theirs."),
        DONT("Do NOT fill the silence. Ask it, stop talking, and let them do the arithmetic out loud. The pause IS the technique."),
      ],
      o: [["They gave a number", "want"], ["“Hard to say”", "want"], ["Brushed it off", "want"]],
    },
    want: {
      t: "Do they actually want it fixed?",
      b: [
        SAY("“So — is this something you actually want to fix this year, or is it just not that big a deal right now?”"),
        WHY("Deliberately makes “no” comfortable, which is the only reason it works. Ask this BEFORE you offer anything. A yes means the audit answers THEIR question instead of being your pitch."),
        NOTE("Both answers win. A soft maybe is the only bad outcome, and this question is what prevents it."),
      ],
      o: [["“Yeah, I want it sorted”", "audit"], ["“Not a priority”", "obj_cold"], ["“How much is it?”", "price"], ["Objection", "obj_hub"]],
    },
    audit: {
      t: "Offer the audit",
      b: [
        SAY("\u201cHere's what I'd suggest \u2014 I'll run your free audit right now, Maps, site and mobile, so it's in your inbox before we hang up. What's the best email? Spell it for me.\u201d"),
        ACTION([
          "Submit the form at rocketgrowthagency.com/free-growth-audit \u2014 read the email back to them before you press submit.",
          "Have them open it and read you one number from the map. Stop there \u2014 the walkthrough is Call 2.",
        ]),
        SAY("\u201cThat's what we'll go through together \u2014 30 minutes. I've got [Thursday 2pm] or [Friday 10am] \u2014 which suits?\u201d"),
        WHY("Two specific times, 1\u20133 business days out \u2014 not \u201cwhen are you free?\u201d. A named slot converts; an open question makes them do work."),
        NOTE("If they want to buy without the audit \u2014 take it. Don't insist on the audit; the audit exists to create this moment."),
      ],
      o: [["Picked a time", "booked"], ["\u201cJust send it over\u201d", "sendaudit"], ["\u201cI'm in \u2014 how do we start?\u201d", "yes"], ["Objection", "obj_hub"]],
    },
    price: {
      t: "They asked the price",
      b: [
        SAY("\u201cIt's $1,250 to get set up \u2014 profile, listings, site fixes and tracking \u2014 then $625 a month for the ongoing work. No contract, cancel whenever.\u201d"),
        WHY("Say the number, then STOP. The silence after a price is the close. Filling it signals you don't believe the number."),
        DONT("NEVER say \u201c$2,500 a month\u201d or \u201c$1,250 a month.\u201d That was an older structure and it is wrong."),
      ],
      o: [["\u201cOK, I'm in\u201d", "yes"], ["\u201cToo expensive\u201d", "obj_price"], ["\u201cWhat's the 3-month plan?\u201d", "plan3"], ["\u201cI don't want a commitment\u201d", "planm2m"]],
    },
    yes: {
      t: "They said YES \u2014 close it",
      b: [
        NOTE("The FGA has done its job. Do NOT offer or complete an audit now \u2014 switching into audit mode stalls a live close."),
        SAY("\u201cGood \u2014 let's get you started.\u201d"),
        WHY("Take the yes and stop selling. The most common mistake here is adding one more feature to someone who already agreed."),
        SAY("\u201cSo you know exactly what you're getting: one Google Business Profile location, two core keywords plus one rotating, and the 9\u00d79 geo-grid so you can see your rank across the whole service area. Extra locations are $500 a month each if you add them later.\u201d"),
        WHY("Say the scope OUT LOUD every time. A vague scope is what causes month-3 arguments about what was included."),
      ],
      o: [["Which plan? \u2192 offer both", "planpick"], ["\u201cNo contract at all\u201d", "obj_contract"]],
    },
    planpick: {
      t: "Offer the two plans",
      b: [
        SAY("\u201cTwo ways to do it. Month-to-month is $1,875 to start \u2014 that's setup plus your first month \u2014 then $625 a month, cancel whenever. Or the 3-month plan is $2,500 all in, which saves you $625 and spreads the setup out. Both are cancel-anytime.\u201d"),
        WHY("Lead with month-to-month. It is the lower-risk yes, and the 3-month plan then reads as a saving rather than a commitment being asked of them."),
        NOTE("Prices live in the Pricing tab \u2014 it is the source of truth, and the contract generator is checked against it."),
      ],
      o: [["\u201c3-month plan\u201d", "plan3"], ["\u201cMonth-to-month\u201d", "planm2m"], ["\u201cStill thinking\u201d", "obj_think"]],
    },
    plan3: {
      t: "3-month plan \u2014 $2,500 all in",
      b: [
        SAY("\u201cGood choice \u2014 that's $1,250 to start, then $625 for month two and month three. $2,500 all in, and it saves you $625 against paying monthly.\u201d"),
        WHY("It is NOT a commitment. It is a discount for spreading the setup fee. If you sell it as a lock-in you have created an objection that does not exist."),
        NOTE("If they ask whether they're tied in: \u201cNo \u2014 you can still cancel any month. The plan is just cheaper.\u201d"),
      ],
      o: [["Confirmed", "send"], ["\u201cAm I locked in?\u201d", "obj_contract"]],
    },
    planm2m: {
      t: "Month-to-month \u2014 $1,875 to start",
      b: [
        SAY("\u201cNo problem \u2014 month-to-month it is. $1,875 today, that's the $1,250 setup plus your first month, then $625 a month after. Cancel any time you like.\u201d"),
        WHY("This IS the default. There is no lock-in to remove, so never sound like you're making an exception \u2014 that implies the other plan traps them."),
      ],
      o: [["Confirmed", "send"], ["\u201cCan I skip the setup fee?\u201d", "obj_setup"]],
    },
    send: {
      t: "Send the agreement",
      b: [
        SAY("\u201cHere's what happens next. I'll set your account up now while we're on the phone \u2014 I've got your email as [email], that right? You'll get access to your portal, and the agreement will be sitting there waiting for you to sign. As soon as it's signed we kick off.\u201d"),
        WHY("Say PORTAL, not \u201cI'll email you a contract.\u201d That is what actually happens, so they know where to look and don't wait on an email that never arrives."),
        SAY("\u201cI'll watch for it come through. If you haven't signed by [day], I'll give you a quick nudge \u2014 sound fair?\u201d"),
        DONT("Don't email a contract yourself and don't take card details on the call. The admin flow creates the portal record that onboarding, billing and their dashboard all hang off."),
        NOTE("After the call: admin \u2192 create the client record \u2192 Send contract for signature \u2192 they sign in the portal \u2192 kickoff."),
      ],
      o: [], out: "Interested \u2014 client record created, contract sent",
    },
    obj_contract: {
      t: "\u201cI don't want a contract\u201d",
      b: [
        SAY("\u201cYou're not signing up for three months \u2014 we're month-to-month either way. That's the point: we have to earn the next month, every month.\u201d"),
        SAY("\u201cThere's no commitment \u2014 you can cancel any month. There's still a service agreement so we both know exactly what's included and what you're paying. Takes a minute to sign.\u201d"),
        WHY("\u201cNo contract\u201d in our pitch means NO LOCK-IN \u2014 never \u201cno paperwork\u201d. The agreement defines scope and payment terms, and it is what creates the portal record everything else depends on. There is no path that skips it."),
      ],
      o: [["Happy now", "planpick"], ["Still hesitant", "obj_think"]],
    },
    obj_price: {
      t: "\u201cToo expensive\u201d",
      b: [
        SAY("\u201cYou said a customer's worth about [$X]. At $625 a month this pays for itself with one extra customer; everything after that is yours. If it never delivers one, you cancel \u2014 that's why there's no contract.\u201d"),
        WHY("Reframe against the value of ONE customer, not against their budget. And point at the cancel clause \u2014 it removes the risk that makes price feel heavy."),
      ],
      o: [["Fair enough", "planpick"], ["\u201cCan I do less?\u201d", "obj_setup"], ["Hard no", "obj_cold"]],
    },
    obj_setup: {
      t: "\u201cCan I skip / reduce the setup fee?\u201d",
      b: [
        SAY("\u201cThe setup is the work that makes the rest work \u2014 profile, listings, site fixes and tracking. What I can do is the 3-month plan: $2,500 all in, which spreads it out and saves you $625.\u201d"),
        WHY("Don't discount the setup \u2014 redirect to the plan that already solves the cash-flow objection. Cutting it teaches them the price is soft."),
      ],
      o: [["Takes the 3-month", "plan3"], ["Sticks with monthly", "planm2m"], ["Still no", "obj_think"]],
    },
    obj_think: {
      t: "\u201cLet me think about it\u201d",
      b: [
        SAY("\u201cOf course. What's the part you want to think about \u2014 the money, or whether it'll actually work?\u201d"),
        WHY("\u201cLet me think\u201d is almost never about thinking. Naming the two real options makes them tell you the actual objection instead of ending the call politely."),
        NOTE("Whatever they say, set a Next Action Date before you hang up. No date means it never happens."),
      ],
      o: [["It's the money", "obj_price"], ["Whether it works", "obj_works"], ["Genuinely needs time", "callback"]],
    },
    obj_works: {
      t: "\u201cWill it actually work?\u201d",
      b: [
        SAY("\u201cFair question. That's exactly why there's no contract \u2014 you'd see the grid move or you'd leave. What would you need to see in month one to feel it was working?\u201d"),
        WHY("Let them define the success measure. It converts a vague doubt into a specific, checkable expectation \u2014 and you find out now whether it is achievable."),
        DONT("Don't promise a rank or a timeline. Never guarantee a position."),
      ],
      o: [["Satisfied", "planpick"], ["Wants proof first", "audit"], ["Still no", "obj_cold"]],
    },
    obj_hub: {
      t: "Objection \u2014 which one?",
      b: [NOTE("Pick the closest. If it isn't here, the Objections tab has the full set.")],
      o: [["Price", "obj_price"], ["\u201cLet me think\u201d", "obj_think"], ["\u201cWill it work?\u201d", "obj_works"], ["\u201cI've been burned before\u201d", "obj_burned"]],
    },
    obj_burned: {
      t: "\u201cI've been burned by an agency\u201d",
      b: [
        SAY("\u201cThat's common, and it's usually the same story: twelve-month contract, monthly report full of charts, no more phone calls. What happened with yours?\u201d"),
        WHY("Naming their experience before they do earns the right to differentiate. Then differentiate on STRUCTURE, not effort:"),
        SAY("\u201cThat's exactly why we're month-to-month. If it isn't working you leave. We have to earn the next month, every month.\u201d"),
      ],
      o: [["Opened up \u2014 keep going", "cost"], ["Wants to see the audit", "audit"], ["Still no", "obj_cold"]],
    },
    obj_cold: {
      t: "\u201cNot interested\u201d",
      b: [
        SAY("\u201cAll good \u2014 I'll check back in a couple of months with fresh ranking data.\u201d"),
        WHY("One attempt, then leave it clean. A warm no is worth far more in 60 days than a pushed no is today."),
        DONT("Don't try a third angle. That is what turns a no into a do-not-call."),
      ],
      o: [["They asked not to be called", "dnc"]], out: "Not interested \u2014 back into the 60-day pool",
    },
    booked: {
      t: "Booked \u2014 confirm it",
      b: [
        SAY("\u201cSent. Can you hit Yes on the invite for me? Easiest is you join from your computer or phone so you can see your map on my screen. If you're out on a job, no problem \u2014 I'll call this number at [time].\u201d"),
        ACTION([
          "Invite: 30 minutes, Google Meet with a Join by phone number, their email as guest \u2014 Close & log \u00a72 has the clicks.",
          "Text them 24 hours and 1\u20132 hours before. Not joined by start + 2 minutes: call them \u2014 Close & log \u00a73.",
        ]),
        WHY("Accepting while you're on the line proves the email works and makes the meeting real. The phone backup means a job site is never a reason to miss it."),
      ],
      o: [], out: "Callback scheduled \u2014 set the Next Action Date",
    },
    sendaudit: {
      t: "They want it sent",
      b: [
        SAY("\u201cSure \u2014 I'll run it right now so it's in your inbox. What's the best email? Spell it for me.\u201d"),
        ACTION([
          "Submit the form at rocketgrowthagency.com/free-growth-audit \u2014 read the email back first. Never send them the link to fill in.",
          "\u201cI'll check in [day] to see what you made of it.\u201d Set a Next Action Date \u2014 no date means it never happens.",
        ]),
      ],
      o: [], out: "Interested \u2014 audit sent",
    },
    callback: {
      t: "Needs time \u2014 lock a date",
      b: [
        SAY("\u201cNo problem. I'll call you [day] at [time] \u2014 does that work?\u201d"),
        WHY("A named day beats \u201cI'll follow up\u201d. Vague follow-ups do not happen."),
      ],
      o: [], out: "Callback scheduled \u2014 set the Next Action Date",
    },
    vm: {
      t: "Voicemail / no answer",
      b: [
        SAY("\u201cHi [first name], [name] at Rocket Growth Agency \u2014 I sent you a short video showing where [business] shows up on Google Maps. Give me a ring back on (424) 242-2040 whenever suits.\u201d"),
        NOTE("Under 15 seconds, say the number slowly. Then TEXT them immediately \u2014 the text is what gets the callback, not the voicemail."),
      ],
      o: [], out: "Left voicemail \u2014 text immediately",
    },
    dnc: {
      t: "Do not call",
      b: [DONT("No follow-up, ever. Log it immediately and suppress the record.")],
      o: [], out: "Do not call \u2014 suppress permanently",
    },
  };

  // A button that points nowhere is worse than no tree at all.
  function checkFlow() {
    const bad = [];
    Object.entries(FLOW).forEach(([id, n]) => {
      (n.o || []).forEach(([label, to]) => { if (!FLOW[to]) bad.push(id + " \u2192 " + to); });
      if (!(n.o || []).length && !n.out) bad.push(id + " (dead end, no outcome)");
    });
    if (bad.length && window.console) console.error("[playbook] broken flow links:", bad);
    return bad;
  }
  checkFlow();

  function block(b) {
    switch (b.k) {
      case "h": return `<h3 class="pb-h" data-h="${esc(b.t)}"><span class="pb-n">${b.n}</span>${esc(b.t)}</h3>`;
      case "say": return `<div class="pb-say"><span class="pb-lbl">Say</span>${ph(b.t)}</div>`;
      case "dont": return `<div class="pb-dont"><span class="pb-lbl">Don't</span>${ph(b.t)}</div>`;
      case "why": return `<div class="pb-why"><span class="pb-lbl">Why</span>${ph(b.t)}</div>`;
      case "action": return `<div class="pb-action"><span class="pb-lbl">Action</span><ol>${b.items.map((i) => `<li>${ph(i)}</li>`).join("")}</ol></div>`;
      case "note": return `<p class="pb-note">${ph(b.t)}</p>`;
      case "see": {
        const sec = PB.find((x) => x.id === b.tab);
        return `<a class="pb-see" href="#" data-see-tab="${esc(b.tab)}" data-see-h="${esc(b.h || "")}"><span class="pb-lbl">See</span>`
          + `${b.lead ? `<span class="pb-see-lead">${ph(b.lead)}</span>` : ""}`
          + `<span class="pb-see-to"><b>${esc(sec ? sec.tab : b.tab)}</b>${b.h ? ` \u00b7 ${ph(b.h)}` : ""}</span><span class="pb-see-go" aria-hidden="true">\u2192</span></a>`;
      }
      case "kpi": return `<div class="pb-kpi">${b.items.map(([n, t]) => `<div><b>${esc(n)}</b>${esc(t)}</div>`).join("")}</div>`;
      case "branch": return `<div class="pb-branch">${b.items.map(([t, p]) => `<div class="pb-br"><div class="t">${ph(t)}</div><p>${ph(p)}</p></div>`).join("")}</div>`;
      case "table": return `<table class="pb-table"><tr>${b.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
      case "obj": return `<details class="pb-obj" data-h="${esc(b.q)}"><summary>${ph(b.q)}</summary><div class="pb-objbody">${b.a.map(block).join("")}</div></details>`;
      default: return "";
    }
  }

  function renderPane(sec) {
    const body = sec.guided
      ? `<div class="pb-flow" data-flow></div>`
      : sec.blocks.map(block).join("");
    return `<section class="pb-pane" data-pane="${sec.id}">
      <h2 class="pb-title">${esc(sec.title)}</h2>
      <p class="pb-sub">${esc(sec.sub)}</p>
      ${body}
    </section>`;
  }

  // The guided renderer. `trail` is the click path — it powers Back and the breadcrumb, because
  // mid-call a misclick with someone talking is unrecoverable otherwise.
  function mountFlow(host) {
    let trail = ["start"];
    function draw() {
      const id = trail[trail.length - 1];
      const n = FLOW[id];
      if (!n) { host.innerHTML = `<p class="pb-note">Missing step "${esc(id)}".</p>`; return; }
      const crumbs = trail.map((t, i) =>
        `<button class="pb-crumb${i === trail.length - 1 ? " on" : ""}" data-i="${i}">${esc(FLOW[t] ? FLOW[t].t : t)}</button>`
      ).join('<span class="pb-crumbsep">\u203a</span>');
      const opts = (n.o || []).map(([label, to]) =>
        `<button class="pb-opt" data-to="${esc(to)}">${ph(label)}</button>`).join("");
      host.innerHTML = `
        <div class="pb-flowbar">
          ${trail.length > 1 ? `<button class="pb-back" data-back>\u2190 Back</button>` : ""}
          <div class="pb-crumbs">${crumbs}</div>
          <button class="pb-restart" data-restart>Restart</button>
        </div>
        <h3 class="pb-h"><span class="pb-n">${trail.length}</span>${esc(n.t)}</h3>
        ${(n.b || []).map(block).join("")}
        ${opts ? `<p class="pb-asked">What did they say?</p><div class="pb-opts">${opts}</div>` : ""}
        ${n.out ? `<div class="pb-out"><span class="pb-lbl">Log this outcome</span>${ph(n.out)}</div>` : ""}`;
      host.querySelectorAll(".pb-opt").forEach((btn) =>
        btn.addEventListener("click", () => { trail.push(btn.dataset.to); draw(); scrollTop(); }));
      const back = host.querySelector("[data-back]");
      if (back) back.addEventListener("click", () => { trail.pop(); draw(); scrollTop(); });
      host.querySelector("[data-restart]").addEventListener("click", () => { trail = ["start"]; draw(); scrollTop(); });
      host.querySelectorAll(".pb-crumb").forEach((c) =>
        c.addEventListener("click", () => { trail = trail.slice(0, Number(c.dataset.i) + 1); draw(); scrollTop(); }));
    }
    function scrollTop() {
      const sc = host.closest(".pb-panes"); if (sc) sc.scrollTop = 0;
    }
    draw();
  }

  function render(root, opts) {
    const compact = !!(opts && opts.compact);
    root.innerHTML = `
      <div class="pb-root${compact ? " pb-compact" : ""}">
        <div class="pb-tabs">${PB.map((s, i) => `<button class="pb-tab${i === 0 ? " on" : ""}" data-t="${s.id}">${esc(s.tab)}</button>`).join("")}</div>
        <div class="pb-search"><input type="search" placeholder="Search — price, busy, competitor, guarantee…" aria-label="Search the playbook"></div>
        <div class="pb-panes">${PB.map(renderPane).join("")}</div>
      </div>`;

    const flowHost = root.querySelector("[data-flow]");
    if (flowHost) mountFlow(flowHost);

    const tabs = [...root.querySelectorAll(".pb-tab")];
    const panes = [...root.querySelectorAll(".pb-pane")];
    const show = (id) => {
      tabs.forEach((t) => t.classList.toggle("on", t.dataset.t === id));
      panes.forEach((p) => p.classList.toggle("on", p.dataset.pane === id));
      const sc = root.querySelector(".pb-panes"); if (sc) sc.scrollTop = 0;
    };
    tabs.forEach((t) => t.addEventListener("click", () => { const i = root.querySelector(".pb-search input"); if (i) i.value = ""; clear(); show(t.dataset.t); }));

    // SEE boxes jump to the section they name: switch tab, open an objection, scroll it to the top.
    root.addEventListener("click", (e) => {
      const a = e.target.closest(".pb-see");
      if (!a || !root.contains(a)) return;
      e.preventDefault();
      const i = root.querySelector(".pb-search input"); if (i) i.value = "";
      clear();
      show(a.dataset.seeTab);
      const pane = root.querySelector(`.pb-pane[data-pane="${a.dataset.seeTab}"]`);
      const target = a.dataset.seeH && pane ? [...pane.querySelectorAll("[data-h]")].find((x) => x.dataset.h === a.dataset.seeH) : null;
      if (!target) return;
      if (target.tagName === "DETAILS") target.open = true;
      target.scrollIntoView({ block: "start" });
      target.classList.add("pb-landed");
      setTimeout(() => target.classList.remove("pb-landed"), 1600);
    });
    show(PB[0].id);

    function clear() { root.querySelectorAll(".pb-hide").forEach((e) => e.classList.remove("pb-hide")); }
    const input = root.querySelector(".pb-search input");
    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      clear();
      if (q.length < 2) { show(root.querySelector(".pb-tab.on").dataset.t); return; }
      // search across every pane — mid-call you don't know which tab the answer lives in
      let firstHit = null;
      panes.forEach((p) => {
        // The guided pane is a live tool, not searchable content — never leave it as the only
        // visible pane showing nothing.
        if (p.querySelector("[data-flow]")) { p.classList.remove("on"); return; }
        let any = false;
        p.querySelectorAll(".pb-obj, .pb-h, .pb-say, .pb-dont, .pb-br, .pb-note, .pb-why, .pb-action, .pb-see, .pb-table").forEach((b) => {
          const hit = b.textContent.toLowerCase().includes(q);
          b.classList.toggle("pb-hide", !hit);
          if (hit) { any = true; if (b.tagName === "DETAILS") b.open = true; }
        });
        p.classList.toggle("on", any);
        if (any && !firstHit) firstHit = p.dataset.pane;
      });
      tabs.forEach((t) => t.classList.toggle("on", t.dataset.t === firstHit));
    });
    return { show };
  }

  window.RGAPlaybook = { render, sections: PB };
})();
