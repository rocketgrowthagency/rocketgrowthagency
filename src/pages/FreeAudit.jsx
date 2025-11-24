import { ArrowRight, Calendar, Check, Gauge, LineChart, Rocket } from 'lucide-react';

export default function FreeAudit() {
  const inclusions = [
    {
      title: 'Traffic and Channels',
      items: [
        'Review of Google and Meta account structure (where available)',
        'Analysis of current targeting, bids, and budgets',
        'Channel mix recommendations based on your market and goals',
        'Checklist of quick changes that can cut obvious wasted spend',
      ],
    },
    {
      title: 'Landing Pages and Conversion',
      items: [
        'Audit of your primary landing page or offer page',
        'Review of headline, offer clarity, and call-to-action placement',
        'Form and call experience check from the visitor’s point of view',
        'List of 5–10 high-impact CRO improvements to test next',
      ],
    },
    {
      title: 'Tracking and Measurement',
      items: [
        'GA4 and tag setup review to see what is and is not being tracked',
        'Validation of core events for forms, calls, and key actions',
        'List of tracking gaps and how to fix them (simple and advanced)',
        'Recommended reporting view so you can see leads by day and source',
      ],
    },
    {
      title: 'Search and SEO Snapshot',
      items: [
        'Quick scan of search visibility for core local keywords',
        'Basic on-page check for your main service or location page',
        'Local pack and review footprint overview (if applicable)',
        'Ideas to strengthen visibility without a full SEO engagement',
      ],
    },
    {
      title: 'Competitor and Market View',
      items: [
        'Snapshot of 2–3 main competitors in ads and on landing pages',
        'Side-by-side comparison of offers, pricing cues, and proof',
        'Notes on what competitors are doing that is worth testing',
        'Suggestions to stand out with your own angles and guarantees',
      ],
    },
    {
      title: 'Action Plan and Next 90 Days',
      items: [
        'Prioritized list of quick wins you can implement in the next 2 weeks',
        'Outline of a 90-day roadmap for channels, budget, and testing',
        'Clear view of what should be handled in-house vs. by an agency',
        'Optional follow-up call to walk through the plan with your team',
      ],
    },
  ];

  const timeline = [
    {
      label: 'Day 0',
      title: 'Fast Intake',
      detail:
        'You complete a short intake form, share read-only access where available, and tell us your goals for the next 90 days.',
    },
    {
      label: 'Day 1',
      title: 'Deep Dive Review',
      detail:
        'We audit your ads, analytics, landing pages, and competitive landscape with a focus on what moves CPL and lead quality.',
    },
    {
      label: 'Day 2',
      title: 'Audit Report Delivery',
      detail:
        'You receive a clear written audit with screenshots, findings, and a prioritized action list grouped by impact and effort.',
    },
    {
      label: 'Day 2–5',
      title: 'Optional Walkthrough',
      detail:
        'If you choose, we schedule a quick review call to walk through the audit, answer questions, and clarify next steps.',
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/#top" className="flex items-center gap-2 font-semibold tracking-tight">
            <div className="w-8 h-8 rounded-xl bg-blue-700 grid place-items-center text-white">
              <Rocket className="w-4 h-4" />
            </div>
            <span>Rocket Growth Agency</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-700">
            <a href="/#results" className="hover:text-slate-900">
              Results
            </a>
            <a href="/#offers" className="hover:text-slate-900">
              Offers
            </a>
            <a href="/#industries" className="hover:text-slate-900">
              Industries
            </a>
            <a href="/#pricing" className="hover:text-slate-900">
              Pricing
            </a>
            <a href="/#faq" className="hover:text-slate-900">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="/#contact"
              className="hidden md:inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 transition"
            >
              Start Sprint
            </a>
            <a
              href="/#contact"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition"
            >
              Free Growth Audit <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12 md:py-16">
        <section className="grid md:grid-cols-2 gap-10 items-start mb-16">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-blue-700 mb-3">Offer Detail</p>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900">
              Free Local Growth Audit
            </h1>
            <p className="mt-4 text-lg text-slate-700">
              A 48-hour audit that checks your ads, analytics, and landing pages, then gives you a
              clear KPI baseline, 90-day plan, and a prioritized list of quick-win fixes.
            </p>
            <div className="mt-6 inline-flex items-baseline gap-3">
              <span className="text-3xl md:text-4xl font-extrabold text-slate-900">Free</span>
              <span className="text-sm text-slate-500">48-hour turnaround, no obligation</span>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              Designed so you can make smarter decisions about channels, budget, and whether now is
              the right time to scale.
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Book Free Audit <Calendar className="w-4 h-4" />
              </a>
              <a
                href="/#offers"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-slate-50"
              >
                View all offers <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center gap-2 text-blue-700 text-xs uppercase tracking-[0.18em] mb-2">
              <Gauge className="w-4 h-4" />
              <span>Audit Outcomes</span>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Clear snapshot of how your current marketing is performing today.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                90-day growth plan with recommended channels, budget, and priorities.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Tracking and funnel fixes you can implement immediately with or without us.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Concise report you can share with leadership or your internal team.
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">
            What we review in your audit
          </h2>
          <p className="text-sm text-slate-700 mb-6 max-w-3xl">
            The goal of the audit is to see the full picture: traffic, tracking, landing pages, and
            your competitive landscape. You end up with a plan that connects all of these pieces
            instead of isolated fixes.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {inclusions.map((block) => (
              <div
                key={block.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="text-sm font-semibold text-slate-900 mb-2">{block.title}</div>
                <ul className="space-y-2 text-sm text-slate-700">
                  {block.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <div className="flex items-center gap-2 mb-4">
            <LineChart className="w-5 h-5 text-blue-700" />
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">48-hour audit timeline</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-4 text-sm">
            {timeline.map((step) => (
              <div
                key={step.label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="text-xs uppercase tracking-[0.18em] text-blue-700">
                  {step.label}
                </div>
                <div className="mt-1 font-semibold text-slate-900">{step.title}</div>
                <p className="mt-2 text-slate-700">{step.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">
            What you leave the audit with
          </h2>
          <p className="text-sm text-slate-700 mb-4 max-w-3xl">
            The audit is designed to be useful whether you work with us, another partner, or keep
            everything in-house. You walk away with a focused set of recommendations, not a generic
            score out of 100.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900 mb-2">For your marketing team</div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Clear checklist of changes to make in ad platforms and tracking tools.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Prioritized testing ideas for offers, creatives, and landing pages.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Suggested reporting views so everyone can see the same numbers.
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900 mb-2">For owners and leaders</div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Simple view of what is working, what is broken, and what it may cost to fix.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Confidence that leads and revenue are being measured accurately.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />A 90-day plan you can approve,
                  delegate, and track with your team.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-10 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600">
                Ready for a clearer picture
              </div>
              <div className="text-lg font-semibold text-slate-900 mt-1">
                Book your Free Local Growth Audit and see exactly what to fix first.
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Book Free Audit <Calendar className="w-4 h-4" />
              </a>
              <a
                href="mailto:hello@rocketgrowthagency.com"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50"
              >
                Email the team
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-slate-600 flex flex-col md:flex-row items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} Rocket Growth Agency. All rights reserved.</div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-slate-900">
              Privacy
            </a>
            <a href="#" className="hover:text-slate-900">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
