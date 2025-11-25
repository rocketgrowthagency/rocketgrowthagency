import React from 'react';
import { ArrowRight, Check, Mail, ChevronRight } from 'lucide-react';

export default function LeadLiftSprintPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
              <span className="text-lg font-semibold text-blue-400">R</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-wide text-slate-50">
                Rocket Growth Agency
              </span>
              <span className="text-xs text-slate-400">Predictable Lead Engine</span>
            </div>
          </a>
          <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="/#services" className="hover:text-slate-50">
              Services
            </a>
            <a href="/#industries" className="hover:text-slate-50">
              Who We Work With
            </a>
            <a href="/#pricing" className="hover:text-slate-50">
              Plans
            </a>
            <a href="/#contact" className="hover:text-slate-50">
              Contact
            </a>
            <a
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-slate-50 shadow-lg shadow-blue-500/30 hover:bg-blue-400"
            >
              Free Growth Audit
              <ArrowRight className="h-4 w-4" />
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-12">
        <section className="grid gap-10 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-start md:gap-12">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-blue-300">
              30-Day Lead Lift Launch Sprint
            </div>
            <h1 className="mb-4 text-balance text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl lg:text-5xl">
              Turn your audit insights into a live&nbsp;
              <span className="text-blue-400">Predictable Lead Engine in 30 days</span>
            </h1>
            <p className="mb-6 max-w-2xl text-base leading-relaxed text-slate-300">
              You&apos;ve seen where leads are leaking. The Launch Sprint is where we fix the
              highest-impact pieces, stand up a working lead engine, and ship your first campaigns
              without locking you into a long-term contract.
            </p>
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/#contact"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-50 shadow-lg shadow-blue-500/30 hover:bg-blue-400"
              >
                Start Your 30-Day Launch Sprint
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#roadmap"
                className="inline-flex items-center justify-center gap-2 text-sm font-medium text-slate-300 hover:text-slate-50"
              >
                See the 30-day roadmap
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
              <div className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                30-day fixed project
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Focused on your highest-impact bottlenecks
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Clear baseline on cost per lead and booked call
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-slate-900/60">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
              By day 30, you&apos;ll have
            </h2>
            <p className="mb-4 text-sm text-slate-300">
              A working lead engine, not just a report or to-do list.
            </p>
            <ul className="mb-6 space-y-3 text-sm text-slate-200">
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  A cleaned-up, conversion-ready lead funnel from first click or visit to booked
                  call
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  At least one high-intent landing page built or overhauled to match your best offer
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  Tracking in place for cost per lead, booked calls, and close rates on Sprint
                  traffic
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  A dialed-in follow-up path for new leads and no-shows with basic email/SMS
                  reminders
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  One or two live campaigns running with an initial baseline of what it costs to
                  acquire a lead
                </span>
              </li>
            </ul>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-400">
              At the end of the Sprint, you&apos;ll know what&apos;s working, what isn&apos;t, and
              exactly what to do next whether you keep it in-house or have us run it for you.
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-500" />
                <a
                  href="mailto:hello@rocketgrowthagency.com"
                  className="font-medium text-slate-200 hover:text-blue-300"
                >
                  hello@rocketgrowthagency.com
                </a>
              </div>
              <span>Fixed 30-day project</span>
            </div>
          </aside>
        </section>

        <section className="mt-16 border-t border-slate-900 pt-12">
          <h2 className="mb-3 text-xl font-semibold text-slate-50">
            What we actually do in the 30-day Sprint
          </h2>
          <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-300">
            We don&apos;t throw random tactics at the wall. We use your audit findings to focus on
            the two or three parts of your funnel that will move the needle fastest.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4 text-sm text-slate-200">
              <h3 className="text-sm font-semibold text-slate-50">Strategy and offer</h3>
              <ul className="space-y-2">
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>Clarify the core offer we&apos;re pushing during the Sprint</span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>
                    Align on who we&apos;re targeting and what success looks like in 30 days
                  </span>
                </li>
              </ul>
              <h3 className="pt-4 text-sm font-semibold text-slate-50">Pages and funnels</h3>
              <ul className="space-y-2">
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>
                    Build or overhaul at least one conversion-ready landing page mapped to your best
                    offer
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>Tighten above-the-fold messaging, proof, and call-to-action</span>
                </li>
              </ul>
            </div>
            <div className="space-y-4 text-sm text-slate-200">
              <h3 className="text-sm font-semibold text-slate-50">Traffic and campaigns</h3>
              <ul className="space-y-2">
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>
                    Set up or restructure one or two campaigns on Google Search, Meta, or both,
                    depending on fit
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>Implement basic negatives and filters to cut obvious wasted spend</span>
                </li>
              </ul>
              <h3 className="pt-4 text-sm font-semibold text-slate-50">Follow-up and ops</h3>
              <ul className="space-y-2">
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>Map how leads are routed through forms, calls, and calendars</span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>
                    Add or fix email and SMS follow-up for new leads and no-shows, including basic
                    reminders
                  </span>
                </li>
              </ul>
              <h3 className="pt-4 text-sm font-semibold text-slate-50">Tracking and reporting</h3>
              <ul className="space-y-2">
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>
                    Implement baseline tracking with UTMs, events, and form captures tied to your
                    goals
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                  <span>
                    Set up a simple weekly report so you see what you&apos;re paying per lead and
                    per booked call
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section id="roadmap" className="mt-16 border-t border-slate-900 pt-12">
          <h2 className="mb-3 text-xl font-semibold text-slate-50">The 30-day roadmap</h2>
          <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-300">
            Here&apos;s how the Sprint actually runs, week by week.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Week 1
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">Foundation and setup</h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li>Align on goals, offer, and target market</li>
                <li>Finalize Sprint plan and priorities</li>
                <li>Build or overhaul your primary landing page</li>
                <li>Set up tracking and connect to your CRM or calendar where possible</li>
              </ul>
            </div>
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Week 2
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">Campaigns live</h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li>Launch one or two campaigns on the agreed channels</li>
                <li>Start routing leads into your intake process</li>
                <li>Fix early friction on forms, numbers, calendars, and routing</li>
                <li>Begin collecting real-world performance data</li>
              </ul>
            </div>
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Weeks 3–4
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">Optimization and handoff</h3>
              <ul className="space-y-2 text-xs text-slate-300">
                <li>Review performance and optimize bids, targeting, and creative</li>
                <li>Tighten follow-up sequences and reminders</li>
                <li>Address bottlenecks like no-shows and slow response times</li>
                <li>
                  Lock in what&apos;s working and present a 60–90 day plan for scale or OS
                  engagement
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-16 border-t border-slate-900 pt-12">
          <h2 className="mb-3 text-xl font-semibold text-slate-50">Who the Launch Sprint is for</h2>
          <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-300">
            The Sprint is designed for owners who want a working system and clear numbers, not just
            more marketing ideas.
          </p>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-300">
                A good fit if you
              </h3>
              <ul className="space-y-3 text-sm text-slate-200">
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>
                    Have leads coming in but know you&apos;re leaving money on the table in your
                    funnel
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>Want to move fast, test smart, and see clear numbers in 30 days</span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>Are willing to collaborate weekly and make decisions quickly</span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>Care more about a working system than a pretty slide deck</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-pink-300">
                Not a fit if you
              </h3>
              <ul className="space-y-3 text-sm text-slate-200">
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-pink-400" />
                  <span>Are not prepared to invest ad spend during the Sprint</span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-pink-400" />
                  <span>
                    Don&apos;t have the capacity to handle more leads in the next 1–2 months
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-pink-400" />
                  <span>
                    Prefer a completely hands-off relationship where you never engage with the
                    numbers
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-16 border-t border-slate-900 pt-12">
          <h2 className="mb-3 text-xl font-semibold text-slate-50">
            What happens after the Sprint
          </h2>
          <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-300">
            At the end of 30 days, you&apos;ll have a working lead engine and real data. From there,
            you have options.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Option 1
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">Keep running it in-house</h3>
              <p className="mb-4 text-xs text-slate-300">
                Use our pages, campaigns, and tracking setup as your new baseline. We&apos;ll hand
                everything off cleanly to you or your team.
              </p>
            </div>
            <div className="flex flex-col rounded-2xl border border-blue-500/50 bg-blue-500/10 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-300">
                Option 2
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">
                Continue with another Sprint
              </h3>
              <p className="mb-4 text-xs text-slate-200">
                Want to tackle a new market, offer, or channel? We can scope a second Sprint focused
                on expanding what&apos;s working.
              </p>
            </div>
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Option 3
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">Predictable Leads OS</h3>
              <p className="mb-4 text-xs text-slate-300">
                If you want us to run and optimize your lead engine month after month, we&apos;ll
                map what a Predictable Leads OS engagement looks like for your business.
              </p>
              <a
                href="/predictable-leads-os"
                className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200"
              >
                See Predictable Leads OS
                <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-slate-900 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-50">
                In 30 days, you&apos;ll know if your lead engine can scale.
              </p>
              <p className="text-xs text-slate-400">
                The Launch Sprint is the bridge between your Free Growth Audit and a full
                Predictable Leads OS.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/#contact"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-50 shadow-lg shadow-blue-500/30 hover:bg-blue-400"
              >
                Start Your 30-Day Launch Sprint
              </a>
              <a
                href="mailto:hello@rocketgrowthagency.com"
                className="inline-flex items-center justify-center gap-2 text-xs font-medium text-slate-300 hover:text-slate-50"
              >
                <Mail className="h-4 w-4" />
                Or email the team directly
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
