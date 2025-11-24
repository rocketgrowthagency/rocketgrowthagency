import { ArrowRight, Calendar, Check, Gauge, LineChart, Rocket } from 'lucide-react';

export default function LeadLiftSprint() {
  const inclusions = [
    {
      title: 'Campaigns and Channels',
      items: [
        'Google Search or Meta Ads sprint focused on your highest-value service',
        'Account restructure where needed to simplify campaigns and budgets',
        'Prospecting and retargeting campaigns tuned for your local market',
        'Targeting refinement to reduce waste and focus on likely buyers',
      ],
    },
    {
      title: 'Landing Pages and Funnels',
      items: [
        'One primary sprint landing page designed for speed and clarity',
        'Optional variant or second page to test a different angle or audience',
        'Form and call routing check so every lead is captured correctly',
        'Thank-you and confirmation flow designed to increase show rates',
      ],
    },
    {
      title: 'Creative and Testing',
      items: [
        '6–9 new ad creatives built around proven angles and objections',
        'Test plan that defines what will be tested each week of the sprint',
        'Headlines and copy variants for search and paid social',
        'Structured notes so winning creatives can be reused after the sprint',
      ],
    },
    {
      title: 'Tracking and Measurement',
      items: [
        'Tracking QA for calls, forms, and key on-site actions',
        'GA4 events verified for the sprint landing page and funnel',
        'Connection between ad platforms and CRM or call tracking where possible',
        'Simple reporting view to track cost-per-lead and booked jobs daily',
      ],
    },
    {
      title: 'Reporting and Optimization',
      items: [
        'Weekly mini-report that shows CPL, lead count, and key learnings',
        'Changes to budgets, bids, and creatives based on performance',
        'Suggestions for follow-up and sales process improvements where needed',
        'End-of-sprint summary with clear recommendations for next steps',
      ],
    },
    {
      title: 'Handoff and Next 90 Days',
      items: [
        'Documented sprint results and what made the biggest impact',
        'Prioritized testing backlog if you extend into an ongoing program',
        'Recommendations for rolling out winners to other services or locations',
        'Clear options: continue, move to a plan, or keep results in-house',
      ],
    },
  ];

  const timeline = [
    {
      label: 'Week 0',
      title: 'Sprint Setup',
      detail:
        'We run a quick intake, access your accounts, confirm the offer, and define the CPL and lead targets for the next 30 days.',
    },
    {
      label: 'Week 1',
      title: 'Build and Launch',
      detail:
        'Campaigns, landing page, tracking, and initial creatives are built and launched. We keep a close eye on early lead quality.',
    },
    {
      label: 'Week 2',
      title: 'Test and Optimize',
      detail:
        'We swap in new creatives, refine targeting, and adjust bids and budgets based on what is driving the best leads.',
    },
    {
      label: 'Week 3–4',
      title: 'Scale and Document',
      detail:
        'Winning elements are pushed harder, poor performers are paused, and we document everything in a clear sprint summary.',
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
              Lead Lift Launch Sprint
            </h1>
            <p className="mt-4 text-lg text-slate-700">
              A 30-day sprint that launches or rebuilds campaigns on Google or Meta, fixes tracking,
              and aggressively tests creative and landing pages to bring your cost per lead down
              fast.
            </p>
            <div className="mt-6 inline-flex items-baseline gap-3">
              <span className="text-3xl md:text-4xl font-extrabold text-slate-900">
                $4,000 one-time
              </span>
              <span className="text-sm text-slate-500">
                plus ad spend, billed direct to platforms
              </span>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              Target: 20–30% lower CPL or a meaningful lift in qualified lead volume, with a clear
              playbook you can keep using after the sprint ends.
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Start the Sprint <Calendar className="w-4 h-4" />
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
              <span>Sprint Outcomes</span>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Live campaigns with clean tracking and clear daily budgets.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Tested landing page and creative set built around your strongest angles.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Documented learnings about which messages and audiences convert best.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Clear decision: roll into an ongoing program, repeat the sprint, or keep it
                in-house.
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">
            What is included in the sprint
          </h2>
          <p className="text-sm text-slate-700 mb-6 max-w-3xl">
            The sprint is designed to be intense but focused. Instead of adding more channels, we
            work hard on a small number of things that meaningfully move your cost-per-lead and
            booked jobs.
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
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">30-day sprint roadmap</h2>
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
            When the sprint is a good fit
          </h2>
          <p className="text-sm text-slate-700 mb-4 max-w-3xl">
            The Lead Lift Launch Sprint is ideal when you want to move fast but do not want to jump
            straight into a long-term retainer. It lets you see how we think, how we communicate,
            and what we can do for your numbers in 30 days.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900 mb-2">Best for</div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Brands with active campaigns that are underperforming on CPL or lead quality.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Teams that need a fresh set of eyes and a structured test plan, not just tweaks.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Owners who want a clear before-and-after view within a fixed time frame.
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900 mb-2">Not ideal for</div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Completely new businesses with no offer, pricing, or intake process defined yet.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Situations where approvals or creative assets will take weeks to produce.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Teams who cannot act on sprint findings after the initial 30 days.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-10 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600">
                Ready for a focused 30 days
              </div>
              <div className="text-lg font-semibold text-slate-900 mt-1">
                See what a structured sprint can do for your lead flow.
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Start the Sprint <Calendar className="w-4 h-4" />
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
