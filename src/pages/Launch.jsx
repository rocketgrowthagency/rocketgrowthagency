import { ArrowRight, Calendar, Check, Gauge, LineChart, Rocket } from 'lucide-react';

export default function Launch() {
  const inclusions = [
    {
      title: 'Acquisition & Traffic',
      items: [
        'One primary channel: Google Search or Meta Ads',
        'Core prospecting + retargeting campaigns',
        'Geo and radius targeting around your service area',
        'Negative keyword and basic exclusion lists to cut waste',
      ],
    },
    {
      title: 'Landing Page & Conversion',
      items: [
        'One high-converting landing page or offer page',
        'Lead capture form with thank-you page and confirmation flow',
        'Tap-to-call and tap-to-text CTAs wired across the page',
        'Basic trust elements: proof, badges, FAQs and risk reducers',
      ],
    },
    {
      title: 'Tracking & Analytics',
      items: [
        'GA4 baseline set up with core events (page_view, scroll, session_start)',
        'Primary conversion event for form submissions or calls',
        'Form tracking validation and test submissions',
        'Simple reporting view so you can see leads by day and source',
      ],
    },
    {
      title: 'Creative & Testing',
      items: [
        'Initial ad concept set for chosen channel (3–5 angles)',
        'Copy variations for headlines and primary text',
        'Basic image or static creative kit to launch quickly',
        'One simple test plan to beat your current CPL benchmark',
      ],
    },
    {
      title: 'Reporting & Strategy',
      items: [
        'Monthly recap with key numbers and next-step recommendations',
        'One KPI focus for the first 60 days (for example: CPL or cost per booked job)',
        'Simple scorecard so your team can see progress at a glance',
        'Slack or email support for quick questions between calls',
      ],
    },
    {
      title: 'Systems & Timeline',
      items: [
        'Intake checklist so we can launch with minimal back-and-forth',
        '30-day launch roadmap with dates and owner for each step',
        'Lightweight follow-up recommendations for your current CRM or booking flow',
        'Clear upgrade path into Growth or Scale once volume is consistent',
      ],
    },
  ];

  const timeline = [
    {
      label: 'Week 0–1',
      title: 'Audit, Offer, and Setup',
      detail:
        'We run a quick audit, lock in your core offer, confirm targeting, and configure tracking so every lead is counted.',
    },
    {
      label: 'Week 2',
      title: 'Launch Campaigns and Page',
      detail:
        'Your campaigns and Launch landing page go live. We watch quality closely and make fast adjustments in the first 72 hours.',
    },
    {
      label: 'Week 3',
      title: 'Optimize and Trim Waste',
      detail:
        'We dial in search terms, tighten audiences, and refine creative to lower cost-per-lead without sacrificing quality.',
    },
    {
      label: 'Week 4',
      title: 'Stabilize and Plan Next Step',
      detail:
        'We review results together, confirm what’s working, and decide whether to extend Launch, move to Growth, or pause.',
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
              Launch – Local Lift
            </h1>
            <p className="mt-4 text-lg text-slate-700">
              Launch is the starter plan for local brands who need their ads, landing page, and
              tracking set up correctly, with a clear 30-day roadmap and a focus on measurable lead
              lift.
            </p>
            <div className="mt-6 inline-flex items-baseline gap-3">
              <span className="text-3xl md:text-4xl font-extrabold text-slate-900">
                $1,500–$2,500/mo
              </span>
              <span className="text-sm text-slate-500">
                plus ad spend, billed direct to platforms
              </span>
            </div>
            <div className="mt-4 text-sm text-slate-600">
              One channel, one landing page, and one clear KPI focus for the first 30 days.
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                Talk about Launch <Calendar className="w-4 h-4" />
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
              <Gauge className="w-4 h-4" />
              <span>Launch Outcomes</span>
            </div>
            <ul className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Clean GA4 baseline with a single primary conversion event defined
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                One high-converting offer page built for speed and clarity
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                Paid campaigns live in one channel with clear daily budget and targeting
              </li>
              <li className="flex gap-2">
                <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                First round of optimizations rolled out within the first month
              </li>
            </ul>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">
            What is included in Launch
          </h2>
          <p className="text-sm text-slate-700 mb-6 max-w-3xl">
            Launch is built to give you a “minimum viable performance engine”: one reliable channel,
            one dialed-in landing page, and tracking that shows what you are paying for. Below is
            exactly what is included.
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
            <h2 className="text-xl md:text-2xl font-bold text-slate-900">30-day Launch roadmap</h2>
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
            When to upgrade beyond Launch
          </h2>
          <p className="text-sm text-slate-700 mb-4 max-w-3xl">
            Launch is ideal when you need a clean setup and quick lift. Once you are seeing
            consistent leads and want more volume or deeper analytics, Growth and Scale add extra
            channels, more landing pages, and a heavier testing program.
          </p>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900 mb-2">What Growth adds</div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Second channel (Google and Meta together) and more landing pages
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Weekly testing cadence instead of monthly tweaks
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Advanced analytics dashboard and deeper reporting
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="font-semibold text-slate-900 mb-2">What Scale adds</div>
              <ul className="space-y-2 text-slate-700">
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Multi-channel campaigns across Google, Meta, and additional networks
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Dedicated creative sprints, CRO program, and RevOps/CRM work
                </li>
                <li className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  Strategic partnership model with recurring roadmap and leadership support
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 pt-10 mb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-600">
                Ready for a clean start
              </div>
              <div className="text-lg font-semibold text-slate-900 mt-1">
                See if Launch is the right first step for your brand.
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
