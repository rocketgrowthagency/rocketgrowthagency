import { ArrowRight, BarChart3, Calendar, Check, LineChart, Rocket } from 'lucide-react';

export default function Growth() {
  const inclusions = [
    {
      title: 'Channels and Campaigns',
      items: [
        'Google and Meta managed together as one acquisition system',
        'Structured campaigns for search, performance max or shopping where relevant',
        'Meta prospecting, retargeting and warm-audience campaigns',
        'Offer sequencing so cold traffic, warm traffic and referrals each see the right pitch',
      ],
    },
    {
      title: 'Funnels and Landing Pages',
      items: [
        'Two to three performance landing pages or funnel variations',
        'Form-first and call-first versions for different traffic types',
        'Dedicated thank-you and confirmation flows to improve show-up rate',
        'Page-level experiments on headlines, offers and layout',
      ],
    },
    {
      title: 'Analytics and Reporting',
      items: [
        'GA4 events for lead, qualified lead and booked appointment where possible',
        'Channel-by-channel and campaign-level performance scorecard',
        'Simple dashboard tying ad spend to leads and estimated revenue',
        'Monthly reporting pack with narrative, not just charts',
      ],
    },
    {
      title: 'Creative and Testing',
      items: [
        'Ongoing creative testing across both channels',
        'Explicit test plan for every 30-day window',
        'Ad copy variations written for each core service line',
        'Basic UGC or testimonial-based creative where available',
      ],
    },
    {
      title: 'Strategy and Communication',
      items: [
        'Bi-weekly strategy calls or loom updates',
        'Quarterly roadmap focused on clear revenue or lead targets',
        'Shared scorecard so your internal team sees the same numbers',
        'Slack or email channel for day-to-day decisions',
      ],
    },
    {
      title: 'Systems and Optimization',
      items: [
        'Review of your current CRM or booking workflow with recommendations',
        'Simple automation ideas: reminders, follow-ups and win-back flows',
        'Lead quality feedback loop so campaigns can be tuned by real outcomes',
        'Upgrade-ready structure for adding more channels in Scale',
      ],
    },
  ];

  const testing = [
    {
      label: 'Month 1',
      title: 'Stabilize and Baseline',
      detail:
        'Stand up campaigns and pages on both channels, confirm tracking, and establish baseline CPL and volume.',
    },
    {
      label: 'Month 2',
      title: 'Test Offers and Audiences',
      detail:
        'Run structured tests on offers, creative and audiences to find combinations that outperform the baseline.',
    },
    {
      label: 'Month 3',
      title: 'Scale Winners and Cut Waste',
      detail:
        'Shift budget toward proven campaigns, turn off weak segments, and refine pages based on real lead quality.',
    },
    {
      label: 'Ongoing',
      title: 'Iterate and Improve',
      detail:
        'Maintain a rolling queue of tests so there is always something in-market aimed at lowering CPL or increasing booked jobs.',
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
            <p className="text-xs uppercase tracking-[0.2em] text-blue-700 mb-3">Plan Detail</p>
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900">Growth – Engine</h1>
            <p className="mt-4 text-lg text-slate-700">
              Growth is the core plan for brands that are ready to treat marketing like a system:
              two channels working together, multiple landing pages, and a consistent testing
              rhythm.
            </p>
            <div className="mt-6 inline-flex items-baseline gap-3">
              <span className="text-3xl md:text-4xl font-extrabold text-slate-900">
                $3,500–$6,000/mo
              </span>
              <span className="text-sm text-slate-500">
                plus ad spend, billed direct to platforms
              </span>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              Best balance of channel coverage, testing depth, and strategy support for most growing
              service brands.
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Talk about Growth <Calendar className="w-4 h-4" />
              </a>
              <a
                href="/#pricing"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold hover:bg-slate-50"
              >
                Compare all plans <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex items-center gap-2 text-blue-700 text-xs uppercase tracking-[0.18em] mb-2">
              <BarChart3 className="w-4 h-4" />
              <span>Growth Outcomes</span>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Two channels working together instead of competing in separate silos
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Multiple landing pages tuned to different offers or audiences
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Weekly tests to steadily push CPL down and booked jobs up
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Clear reporting that ties spend, leads and outcomes together
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">
            What is included in Growth
          </h2>
          <p className="text-sm text-slate-700 mb-6 max-w-3xl">
            Growth takes everything from Launch and expands it into a two-channel engine with a
            deeper testing and reporting layer. Here is exactly what you get.
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
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">
              Testing cadence and roadmap
            </h2>
          </div>
          <div className="grid md:grid-cols-4 gap-4 text-sm">
            {testing.map((step) => (
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
            How Growth compares to Launch and Scale
          </h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600 mb-1">
                Versus Launch
              </div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Adds a second channel instead of just one
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Adds multiple landing pages and more funnel variants
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Moves from monthly tweaks to weekly tests
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600 mb-1">
                Core of the Engine
              </div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Best-fit plan for most growing brands who want consistent lead flow
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Enough testing velocity to move the numbers without overwhelming your team
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600 mb-1">
                Versus Scale
              </div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Lighter creative and CRO program than Scale
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Less RevOps/CRM build-out work, more focus on acquisition and pages
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-10 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600">
                Ready for a real engine
              </div>
              <div className="text-lg font-semibold text-slate-900 mt-1">
                See if Growth is the right “always-on” plan for your brand.
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Book a Growth Audit <Calendar className="w-4 h-4" />
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
