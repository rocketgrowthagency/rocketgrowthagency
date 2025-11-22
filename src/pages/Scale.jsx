import { ArrowRight, Calendar, Check, Rocket, Sparkles, TrendingUp } from 'lucide-react';

export default function Scale() {
  const inclusions = [
    {
      title: 'Channels and Coverage',
      items: [
        'Google, Meta and at least one expansion channel (for example: YouTube, Discovery or TikTok) where it makes sense',
        'Structured campaigns for prospecting, retargeting and high-intent search across markets',
        'Budget allocation framework that balances efficiency and growth',
        'Playbooks for entering new territories or launching new locations',
      ],
    },
    {
      title: 'CRO and Funnels',
      items: [
        'Ongoing conversion rate optimization program for key landing pages',
        'Dedicated test plan for forms, layout, copy and social proof',
        'Offer bundles and upsell flows designed to lift revenue per booking',
        'Multi-step or quiz funnels where useful for qualification',
      ],
    },
    {
      title: 'Creative and Messaging',
      items: [
        'Creative sprints each cycle focused on new concepts and formats',
        'Angle and hook testing roadmap across multiple services',
        'Systems to re-use winning creatives across channels without fatigue',
        'Guidance for capturing simple UGC, testimonial and founder-led content',
      ],
    },
    {
      title: 'RevOps and CRM',
      items: [
        'Review of lead routing, speed-to-lead and follow-up sequences',
        'Recommendations or implementation support inside your CRM or booking tool',
        'Lead quality feedback loop so campaigns are optimized on revenue, not just leads',
        'Basic pipeline reporting: from lead to opportunity to closed job',
      ],
    },
    {
      title: 'Analytics and Leadership Reporting',
      items: [
        'Executive dashboard that rolls up spend, leads, pipeline and revenue',
        'Channel and location breakouts for multi-location brands',
        'Attribution views that summarize how channels work together',
        'Quarterly board-ready summary of marketing performance',
      ],
    },
    {
      title: 'Partnership and Governance',
      items: [
        'Dedicated strategist as your main point of contact',
        'Monthly strategy sessions plus on-demand Loom updates',
        'Quarterly planning deep dives for launches, new markets or offers',
        'Documented operating rhythm so your internal team knows what to expect',
      ],
    },
  ];

  const roadmap = [
    {
      label: 'Phase 1',
      title: 'Stabilize and Align',
      detail:
        'Clean up tracking, tighten campaigns, and align on targets and definitions of success across teams.',
    },
    {
      label: 'Phase 2',
      title: 'Scale What Works',
      detail:
        'Increase volume in proven campaigns, roll out successful pages and creatives to new markets and segments.',
    },
    {
      label: 'Phase 3',
      title: 'Optimize the Funnel',
      detail:
        'Invest in CRO, RevOps and CRM improvements so more leads turn into revenue without endlessly raising budgets.',
    },
    {
      label: 'Phase 4',
      title: 'Expand and Innovate',
      detail:
        'Test new channels, offers and markets from a strong core, with clear guardrails on efficiency and payback.',
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
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900">
              Scale – Performance Partner
            </h1>
            <p className="mt-4 text-lg text-slate-700">
              Scale is for brands that treat marketing as a growth lever, not just a cost center. It
              combines multi-channel campaigns with CRO, RevOps and leadership-ready reporting.
            </p>
            <div className="mt-6 inline-flex items-baseline gap-3">
              <span className="text-3xl md:text-4xl font-extrabold text-slate-900">
                $7,000–$12,000/mo
              </span>
              <span className="text-sm text-slate-500">
                plus ad spend, billed direct to platforms
              </span>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              Built for brands that want a performance partner: deeper analytics, systems work, and
              help thinking through what to do next.
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Talk about Scale <Calendar className="w-4 h-4" />
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
              <TrendingUp className="w-4 h-4" />
              <span>Scale Outcomes</span>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Growth plan plus additional channels and more aggressive testing
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                CRO and RevOps work so more leads turn into revenue
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Executive-level reporting across markets and locations
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Strategic partner who helps decide where to invest next
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">
            What is included in Scale
          </h2>
          <p className="text-sm text-slate-700 mb-6 max-w-3xl">
            Scale extends Growth into a full performance partnership. Alongside campaigns and
            landing pages, we work on your funnel, CRM and reporting so leadership can make better
            decisions with confidence.
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
            <Sparkles className="w-5 h-5 text-blue-700" />
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">Partnership roadmap</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-4 text-sm">
            {roadmap.map((step) => (
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
            How Scale builds on Growth
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600 mb-1">
                Additional Workstreams
              </div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  CRO program with structured page and funnel testing
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  RevOps and CRM workstreams alongside media management
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Deeper creative sprints and content collaboration
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600 mb-1">
                Leadership Support
              </div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Quarterly planning and forecasting support for marketing and sales
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Executive dashboards and summaries for leadership or investors
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Clear documentation of decisions, tests and learnings over time
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-10 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600">
                Ready for a performance partner
              </div>
              <div className="text-lg font-semibold text-slate-900 mt-1">
                See if Scale is the right move for your next phase of growth.
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
