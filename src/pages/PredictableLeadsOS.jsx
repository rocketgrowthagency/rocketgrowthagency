import { ArrowRight, Calendar, Check, Gauge, LineChart, Rocket } from 'lucide-react';

export default function PredictableLeadsOS() {
  const inclusions = [
    {
      title: 'Channels and Coverage',
      items: [
        'Ongoing management of Google and Meta as your core lead channels',
        'Option to test an expansion channel such as YouTube, Discovery, or TikTok',
        'Always-on prospecting plus thoughtful retargeting and brand campaigns',
        'Budget planning by channel so spend lines up with capacity and goals',
      ],
    },
    {
      title: 'Funnels and Conversion',
      items: [
        '2–3 core landing pages or funnels tuned for different offers or audiences',
        'Ongoing CRO tests on forms, headlines, layouts, and proofs',
        'Systems for capturing leads from calls, chats, and form submissions',
        'Ideas to improve show rates and close rates, not just form fills',
      ],
    },
    {
      title: 'Analytics and Reporting',
      items: [
        'GA4 and platform data stitched together into a clear dashboard',
        'Lead and revenue reporting that connects spend to booked jobs',
        'Monthly or bi-weekly performance reviews depending on your plan',
        'Alerts for major swings so your team is never surprised by performance',
      ],
    },
    {
      title: 'CRM, Reviews, and Retention',
      items: [
        'Basic RevOps support to keep pipelines, stages, and lead statuses clean',
        'Review-generation workflows so happy customers leave more social proof',
        'Ideas for simple retention and reactivation campaigns for past customers',
        'Coordination with your existing CRM or booking tools where possible',
      ],
    },
    {
      title: 'Creative and Messaging',
      items: [
        'Regular creative refresh cycles for ads to prevent fatigue',
        'Testing of new value props, guarantees, and proof points',
        'Guidance on offer positioning across channels and landing pages',
        'Asset requests scoped so your internal or external team knows what to build',
      ],
    },
    {
      title: 'Strategy and Leadership',
      items: [
        'Quarterly planning focused on pipeline, capacity, and revenue targets',
        'Clear roadmap of tests and projects for the upcoming quarter',
        'Channel recommendations when it is time to expand or consolidate',
        'Support for internal presentations so leadership understands performance',
      ],
    },
  ];

  const timeline = [
    {
      label: 'Month 1',
      title: 'Stabilize and Baseline',
      detail:
        'We audit current campaigns and tracking, fix the major issues, and establish a reliable baseline for leads and cost-per-lead.',
    },
    {
      label: 'Month 2–3',
      title: 'Optimize and Systemize',
      detail:
        'We roll out ongoing tests to improve CPL and lead quality while solidifying reporting, pipelines, and review flows.',
    },
    {
      label: 'Month 4+',
      title: 'Scale with Confidence',
      detail:
        'With tracking and funnels stable, we gradually increase budgets, test new channels, and explore additional offers or locations.',
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
              Predictable Leads OS
            </h1>
            <p className="mt-4 text-lg text-slate-700">
              A monthly program that treats your marketing like a system: campaigns, landing pages,
              tracking, and reporting all working together to deliver stable, scalable lead flow.
            </p>
            <div className="mt-6 inline-flex items-baseline gap-3">
              <span className="text-3xl md:text-4xl font-extrabold text-slate-900">
                Custom monthly retainer
              </span>
              <span className="text-sm text-slate-500">
                most clients between $3,500–$6,000/mo plus ad spend
              </span>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              Built for brands that want a long-term performance partner, not just campaign
              maintenance. The goal is simple: reliable pipeline that leadership can plan around.
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Talk about OS <Calendar className="w-4 h-4" />
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
              <span>Program Outcomes</span>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Stable monthly lead flow with clear targets for each channel.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Dashboards that connect marketing spend to pipeline and revenue.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Regular testing and creative refreshes so performance does not stall.
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Strategic partner who helps decide where to invest next, not just run ads.
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">
            What is included in Predictable Leads OS
          </h2>
          <p className="text-sm text-slate-700 mb-6 max-w-3xl">
            The OS combines channel management, conversion optimization, analytics, and light RevOps
            support into a single program. Instead of juggling multiple vendors, you have one team
            responsible for the full lead engine.
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
              How the program rolls out
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
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
            When Predictable Leads OS is the right move
          </h2>
          <p className="text-sm text-slate-700 mb-4 max-w-3xl">
            This program is for teams who want to treat marketing as a growth lever, not just a cost
            center. It works best when there is already demand for your services and you want a
            partner to turn that demand into a reliable pipeline.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900 mb-2">You are a good fit if</div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  You have proven offers and a sales process but want more consistent volume.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Leadership cares about pipeline, not just impressions or clicks.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  You value a long-term partner who brings ideas, not just reports.
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900 mb-2">You may not be ready if</div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  You are still validating your core offer or business model from scratch.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  There is no internal owner for sales or lead follow-up yet.
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  You are primarily looking for a one-time project instead of an ongoing partner.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-10 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600">
                Ready for predictable pipeline
              </div>
              <div className="text-lg font-semibold text-slate-900 mt-1">
                Let&apos;s see if Predictable Leads OS is the right operating system for your
                growth.
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Talk about OS <Calendar className="w-4 h-4" />
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
