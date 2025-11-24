import React from 'react';
import { ArrowRight, Check, Mail, ChevronRight } from 'lucide-react';

export default function FreeAuditPage() {
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
              Free Local Growth Audit
            </div>
            <h1 className="mb-4 text-balance text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl lg:text-5xl">
              Find the 3 biggest leaks in your lead funnel&nbsp;
              <span className="text-blue-400">in 48 hours</span>
            </h1>
            <p className="mb-6 max-w-2xl text-base leading-relaxed text-slate-300">
              Most agencies jump straight into selling retainers. We start with a fast, focused
              audit of your current lead flow so you know exactly what to fix first before you
              commit to a long-term engagement.
            </p>
            <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/#contact"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-50 shadow-lg shadow-blue-500/30 hover:bg-blue-400"
              >
                Book Your Free Growth Audit
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 text-sm font-medium text-slate-300 hover:text-slate-50"
              >
                See how the audit works
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
              <div className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                48-hour turnaround
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                No obligation, no retainer required
              </div>
              <div className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Local and service businesses only
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-slate-900/60">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
              What you&apos;ll walk away with
            </h2>
            <p className="mb-4 text-sm text-slate-300">
              A concrete, prioritized plan to improve your lead flow in the next 30 days.
            </p>
            <ul className="mb-6 space-y-3 text-sm text-slate-200">
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  A clear map of how leads currently find you, contact you, and where they fall
                  through the cracks
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  The top 3–5 issues that are quietly killing conversion, with screenshots and
                  specific examples
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  Quick-win fixes you can apply in the next 7–14 days to start improving lead flow
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>A simple 30-day action plan tailored to your market and offer</span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                <span>
                  A short Loom walkthrough so your team can revisit the recommendations anytime
                </span>
              </li>
            </ul>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 text-xs text-slate-400">
              No obligation. You can implement the plan yourself, give it to your current agency, or
              have us run it for you.
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
              <span>48-hour turnaround</span>
            </div>
          </aside>
        </section>

        <section id="how-it-works" className="mt-16 border-t border-slate-900 pt-12">
          <h2 className="mb-3 text-xl font-semibold text-slate-50">What we actually audit</h2>
          <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-300">
            This isn&apos;t a generic website review. We follow a checklist we use on paying clients
            to find the exact friction points that are holding back your lead flow.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <ul className="space-y-3 text-sm text-slate-200">
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                <span>
                  Website and landing pages: clarity of offer, above-the-fold messaging, and
                  call-to-action
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                <span>
                  Lead capture: forms, calendars, and lead magnets that visitors actually interact
                  with
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                <span>
                  Follow-up: email and SMS sequences, speed-to-lead, and how many leads never get
                  touched
                </span>
              </li>
            </ul>
            <ul className="space-y-3 text-sm text-slate-200">
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                <span>
                  Traffic sources: what&apos;s driving calls and form fills today, even if it&apos;s
                  mostly referrals or word-of-mouth
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                <span>
                  Tracking: whether you&apos;re measuring the right numbers or flying blind on cost
                  per lead
                </span>
              </li>
              <li className="flex gap-3">
                <Check className="mt-0.5 h-4 w-4 flex-none text-blue-400" />
                <span>
                  If you&apos;re running ads, we include a surface-level review of your Google and
                  Meta campaigns
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="mt-16 border-t border-slate-900 pt-12">
          <h2 className="mb-3 text-xl font-semibold text-slate-50">
            Who the Free Growth Audit is for
          </h2>
          <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-300">
            The audit is designed for owners who need clarity and a plan, not another vague sales
            call.
          </p>
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-300">
                A good fit if you
              </h3>
              <ul className="space-y-3 text-sm text-slate-200">
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>Run a local or service business that lives and dies by inbound leads</span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>
                    Have tried agencies or one-off campaigns that didn&apos;t move the needle
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>
                    Are willing to share access to your site, calendar, and basic analytics so we
                    can do real work
                  </span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-400" />
                  <span>
                    Want a clear plan before investing in a 30-day sprint or ongoing retainer
                  </span>
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
                  <span>Are not actively taking on new clients</span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-pink-400" />
                  <span>Are just shopping for the lowest-bid agency</span>
                </li>
                <li className="flex gap-3">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-pink-400" />
                  <span>
                    Are unwilling to implement any changes, even small ones, from the audit
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-16 border-t border-slate-900 pt-12">
          <h2 className="mb-3 text-xl font-semibold text-slate-50">
            What happens after your audit
          </h2>
          <p className="mb-6 max-w-3xl text-sm leading-relaxed text-slate-300">
            Once you&apos;ve reviewed the findings and Loom walkthrough, you&apos;ll have three
            options for how to move forward.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Option 1
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">Implement it yourself</h3>
              <p className="mb-4 text-xs text-slate-300">
                Take the report and give it to your in-house team or existing agency to execute. No
                hard feelings, no strings attached.
              </p>
            </div>
            <div className="flex flex-col rounded-2xl border border-blue-500/50 bg-blue-500/10 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-300">
                Option 2
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">
                30-Day Lead Lift Launch Sprint
              </h3>
              <p className="mb-4 text-xs text-slate-200">
                If you want us to implement the highest-impact pieces for you, we&apos;ll scope a
                30-day sprint to stand up a first version of your Predictable Lead Engine.
              </p>
              <a
                href="/lead-lift-sprint"
                className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-blue-300 hover:text-blue-200"
              >
                Learn about the Launch Sprint
                <ChevronRight className="h-3 w-3" />
              </a>
            </div>
            <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Option 3
              </p>
              <h3 className="mb-2 text-sm font-semibold text-slate-50">Predictable Leads OS</h3>
              <p className="mb-4 text-xs text-slate-300">
                If you already have volume and want a partner to run, optimize, and scale your lead
                engine month over month, we&apos;ll talk about whether our Predictable Leads OS
                retainer makes sense.
              </p>
            </div>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-slate-900 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-50">
                Start with clarity, not a long-term contract.
              </p>
              <p className="text-xs text-slate-400">
                The Free Local Growth Audit is the first step into the Predictable Lead Engine.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/#contact"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-slate-50 shadow-lg shadow-blue-500/30 hover:bg-blue-400"
              >
                Book Your Free Growth Audit
                <ArrowRight className="h-4 w-4" />
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
