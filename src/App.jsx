import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  ChevronRight,
  ClipboardCheck,
  Gauge,
  LineChart,
  Mail,
  Phone,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  PlayCircle,
} from 'lucide-react';

export default function App() {
  const [formStatus, setFormStatus] = useState('idle'); // idle | submitting | success | error

  const handleAuditSubmit = async (event) => {
    event.preventDefault();
    setFormStatus('submitting');

    const form = event.target;

    // Grab typed name/email so we can build a unique subject
    const nameInput = form.elements?.name || form.querySelector('input[name="name"]');
    const emailInput = form.elements?.email || form.querySelector('input[name="email"]');

    const nameValue =
      (nameInput && typeof nameInput.value === 'string' ? nameInput.value.trim() : '') || '';
    const emailValue =
      (emailInput && typeof emailInput.value === 'string' ? emailInput.value.trim() : '') || '';

    // Populate hidden "subject" field so Netlify can use it for the email subject
    const subjectInput = form.elements?.subject || form.querySelector('input[name="subject"]');
    if (subjectInput) {
      const safeName = nameValue || 'New Lead';
      const safeEmail = emailValue || '';
      subjectInput.value = `[Rocket Growth] Growth Audit – ${safeName}${
        safeEmail ? ` <${safeEmail}>` : ''
      }`;
    }

    const formData = new FormData(form);

    // Ensure Netlify sees the correct form name
    if (!formData.get('form-name')) {
      formData.set('form-name', 'audit');
    }

    try {
      await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(formData).toString(),
      });

      setFormStatus('success');
      form.reset();
    } catch (error) {
      console.error(error);
      setFormStatus('error');
    } finally {
      // Reset message after a few seconds
      setTimeout(() => setFormStatus('idle'), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-blue-200">
      {/* Utility bar */}
      <div className="bg-blue-50 border-b border-blue-100">
        <div className="max-w-6xl mx-auto px-4 py-2 text-xs text-blue-800 flex items-center justify-between">
          <div className="uppercase tracking-widest">
            Performance Marketing for Local Service Brands
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <a className="hover:text-blue-900" href="mailto:hello@rocketgrowthagency.com">
              hello@rocketgrowthagency.com
            </a>
            <a className="hover:text-blue-900" href="tel:+1">
              (XXX) XXX-XXXX
            </a>
            <a className="text-blue-700 hover:text-blue-800 font-medium" href="#contact">
              Free Audit
            </a>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur bg-white/90 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight">
            <div className="w-8 h-8 rounded-xl bg-blue-700 grid place-items-center text-white">
              <Rocket className="w-4 h-4" />
            </div>
            <span>Rocket Growth Agency</span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-700">
            <a href="#proof" className="hover:text-slate-900">
              Results
            </a>
            <a href="#offers" className="hover:text-slate-900">
              Offers
            </a>
            <a href="#industries" className="hover:text-slate-900">
              Industries
            </a>
            <a href="#pricing" className="hover:text-slate-900">
              Pricing
            </a>
            <a href="#faq" className="hover:text-slate-900">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="#contact"
              className="hidden md:inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 transition"
            >
              Start Sprint
            </a>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition"
            >
              Free Growth Audit <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative overflow-hidden bg-white">
        {/* Background gradient, non-interactive */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(65%_60%_at_50%_0%,rgba(59,130,246,0.10),rgba(255,255,255,0))]"
          aria-hidden="true"
        />
        <div className="relative max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-start">
          {/* Left: copy + proof */}
          <div>
            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-blue-700 mb-4">
              <Sparkles className="w-4 h-4" /> Performance Advertising that Books Real Appointments
            </p>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight text-slate-900">
              Build a <span className="text-blue-700">Predictable Lead Engine</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-slate-700 max-w-2xl">
              We combine profitable Google/Meta, conversion-focused pages, and automated follow-up.
              Most clients see measurable lift within 14–30 days.
            </p>

            {/* KPI chips */}
            <div id="proof" className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { kpi: '−28%', desc: 'Cost-per-Lead in 30 days', Icon: Gauge },
                { kpi: '2.0×', desc: 'ROAS by Month 2', Icon: LineChart },
                {
                  kpi: '+41%',
                  desc: 'Form Conversion after LP revamp',
                  Icon: ThumbsUp,
                },
              ].map(({ kpi, desc, Icon }) => (
                <div key={desc} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2 text-blue-700 mb-1">
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px] uppercase tracking-widest">Result</span>
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900">{kpi}</div>
                  <div className="text-sm text-slate-600">{desc}</div>
                </div>
              ))}
            </div>

            {/* Video proof placeholder */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="aspect-[16/9] rounded-lg grid place-items-center border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 text-slate-600">
                  <PlayCircle className="w-6 h-6" /> Case study video placeholder
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#contact"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700 transition"
              >
                Book a Free Growth Audit <Calendar className="w-4 h-4" />
              </a>
              <a
                href="#offers"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50 transition"
              >
                Start a 30-Day Launch Sprint <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Right: lead card (Netlify Forms-ready) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-slate-700">
              <ShieldCheck className="w-4 h-4 text-blue-700" />
              <span className="text-xs uppercase tracking-widest">48-Hour Turnaround</span>
            </div>
            <h3 className="text-xl font-bold text-slate-900">Get Your Free Local Growth Audit</h3>
            <p className="text-slate-600 text-sm mt-1">
              We’ll send a KPI baseline, 90-day plan, and quick wins you can implement immediately.
            </p>

            <form
              name="audit"
              method="POST"
              data-netlify="true"
              netlify-honeypot="bot-field"
              onSubmit={handleAuditSubmit}
              className="mt-5 grid grid-cols-1 gap-3"
            >
              <input type="hidden" name="form-name" value="audit" />
              <input type="hidden" name="subject" value="" />

              {/* Honeypot field (hidden from real users) */}
              <p className="hidden">
                <label>
                  Don’t fill this out: <input name="bot-field" />
                </label>
              </p>

              <input
                className="w-full rounded-lg bg-white border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-300"
                name="name"
                placeholder="Full name"
                required
              />
              <input
                className="w-full rounded-lg bg-white border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-300"
                name="email"
                type="email"
                placeholder="Work email"
                required
              />
              <input
                className="w-full rounded-lg bg-white border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-300"
                name="url"
                placeholder="Website or GBP URL"
              />
              <button
                type="submit"
                disabled={formStatus === 'submitting'}
                className="rounded-lg bg-blue-600 text-white px-5 py-3 font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {formStatus === 'submitting' ? 'Sending...' : 'Send My Audit'}
                <ChevronRight className="w-4 h-4" />
              </button>

              {formStatus === 'success' && (
                <div className="text-[11px] text-green-600">
                  Thanks — we’ll review your audit and email you shortly.
                </div>
              )}
              {formStatus === 'error' && (
                <div className="text-[11px] text-red-600">
                  Something went wrong. Please try again or email hello@rocketgrowthagency.com.
                </div>
              )}

              <div className="text-[11px] text-slate-500">
                By submitting, you agree to be contacted about your audit. No spam, ever.
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Cred bar */}
      <section className="py-8 border-y border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 text-center text-slate-500 text-xs uppercase tracking-widest">
          Trusted strategies used across leading local brands (logos here)
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <div className="flex items-end justify-between gap-6 mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Industries We Scale</h2>
          <a href="#contact" className="text-sm text-blue-700 hover:text-blue-800">
            See if you’re a fit →
          </a>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 text-sm">
          {[
            'HVAC',
            'Plumbing',
            'Roofing',
            'Pest Control',
            'Dental',
            'Med Spa',
            'Attorneys',
            'Auto Repair',
            'Property Mgmt',
            'Water Damage',
            'Chiro/PT',
            'Landscaping',
          ].map((v) => (
            <div
              key={v}
              className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm"
            >
              {v}
            </div>
          ))}
        </div>
      </section>

      {/* Offers */}
      <section id="offers" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <div className="flex items-end justify-between gap-6 mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900">Flagship Offers</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Offer 1 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-slate-700">
              <ClipboardCheck className="w-4 h-4 text-blue-700" />
              <span className="text-xs uppercase tracking-widest">48-Hour Audit</span>
            </div>
            <h3 className="text-xl font-bold">Free Local Growth Audit</h3>
            <p className="text-slate-600 mb-4">
              KPI baseline, 90-day plan, tracking check, quick-win fixes.
            </p>
            <ul className="space-y-2 text-sm text-slate-700">
              {[
                'Ads/SEO/LP review',
                'Budget plan + competitor snapshot',
                'Prioritized quick wins',
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  {t}
                </li>
              ))}
            </ul>
            <a
              href="#contact"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 font-semibold hover:bg-blue-700"
            >
              Book Free Audit <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Offer 2 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-slate-700">
              <Rocket className="w-4 h-4 text-blue-700" />
              <span className="text-xs uppercase tracking-widest">30-Day Sprint</span>
            </div>
            <h3 className="text-xl font-bold">Lead Lift Launch Sprint</h3>
            <p className="text-slate-600 mb-4">
              Live campaigns + fast CPL reduction on Google <span className="opacity-70">or</span>{' '}
              Meta.
            </p>
            <ul className="space-y-2 text-sm text-slate-700">
              {[
                'Tracking fix + call tracking',
                '1–2 landing pages',
                '6–9 creative tests, weekly report',
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="mt-4 text-sm text-slate-700">
              Target: <span className="font-semibold text-slate-900">−20–30% CPL</span> or{' '}
              <span className="font-semibold text-slate-900">+25–50 qualified leads</span>.
            </div>
            <a
              href="#contact"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50"
            >
              Start the Sprint <ArrowRight className="w-4 h-4" />
            </a>
          </div>

          {/* Offer 3 */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3 text-slate-700">
              <BarChart3 className="w-4 h-4 text-blue-700" />
              <span className="text-xs uppercase tracking-widest">Monthly Program</span>
            </div>
            <h3 className="text-xl font-bold">Predictable Leads OS</h3>
            <p className="text-slate-600 mb-4">
              Stable, scalable lead flow with ongoing optimization.
            </p>
            <ul className="space-y-2 text-sm text-slate-700">
              {[
                'Google + Meta management',
                'CRO tests + 2–3 LPs',
                'Reviews engine + GA4 dashboard',
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                  {t}
                </li>
              ))}
            </ul>
            <a
              href="#pricing"
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-semibold hover:bg-slate-50"
            >
              See What’s Included <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* One-time Sprint */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-700">Project</div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              30-Day Launch Sprint — $4,000 one-time
            </div>
            <div className="text-sm text-slate-700 mt-2">
              Includes Launch Readiness Pack: tracking QA, 1–2 LPs, creative kit, runbook. Target:
              −20–30% CPL or +25–50 qualified leads by Day 30. Ad spend separate.
            </div>
          </div>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 font-semibold hover:bg-blue-700"
          >
            Start Sprint <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Outcomes */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">Recent Outcomes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              k: 'HVAC',
              h: '−32% CPL in 45 days',
              t: 'Google Search + LP revamp + call routing.',
            },
            {
              k: 'Med Spa',
              h: '+63% Bookings in 60 days',
              t: 'UGC creators + Meta + SMS follow-up.',
            },
            {
              k: 'Dental',
              h: '2.1× ROAS by Month 2',
              t: 'Invisalign promo + 2-step funnel.',
            },
          ].map((cs) => (
            <div key={cs.h} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xs uppercase tracking-widest text-slate-500">{cs.k}</div>
              <div className="text-xl font-bold text-slate-900 mt-1">{cs.h}</div>
              <div className="text-sm text-slate-600 mt-2">{cs.t}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">What Owners Say</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              n: 'James R.',
              r: 'HVAC Owner',
              t: 'They rebuilt our pages and calls doubled in 6 weeks.',
            },
            {
              n: 'Dr. Patel',
              r: 'Dental Practice',
              t: 'New-patient bookings up 48% without upping ad spend.',
            },
            {
              n: 'Maria G.',
              r: 'Med Spa',
              t: 'Finally have a dashboard that ties ads to appointments.',
            },
          ].map((q) => (
            <div key={q.n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-amber-500 mb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-current" />
                ))}
              </div>
              <div className="text-sm text-slate-700">“{q.t}”</div>
              <div className="text-xs text-slate-500 mt-3">
                {q.n} • {q.r}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">How We Work</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm">
          {[
            {
              n: '01',
              t: 'Diagnose',
              d: 'Audit ads/site/tracking; define KPI targets; fix measurement.',
            },
            {
              n: '02',
              t: 'Design',
              d: 'Offer & funnel map, creative briefs, media plan.',
            },
            {
              n: '03',
              t: 'Deploy',
              d: 'Launch ads + pages; SMS/email follow-up; retargeting.',
            },
            {
              n: '04',
              t: 'Optimize',
              d: 'Weekly tests; monthly executive readout; quarterly roadmap.',
            },
          ].map((s) => (
            <div key={s.t} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-blue-700 text-xs uppercase tracking-widest">{s.n}</div>
              <div className="text-base font-semibold text-slate-900 mt-1">{s.t}</div>
              <div className="text-slate-700 mt-2">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              name: 'Launch — Local Lift',
              price: '$1,500–$2,500/mo',
              note: '+ ad spend (billed direct)',
              perks: [
                '1 channel (Google or Meta)',
                '1 landing page',
                'Reviews engine',
                'Basic reporting',
                'Monthly review',
              ],
              cta: 'Choose Launch',
            },
            {
              name: 'Growth — Engine',
              price: '$3,500–$6,000/mo',
              note: 'Best value for SMBs ready to scale',
              perks: [
                'Google + Meta',
                '2–3 landing pages',
                'Weekly tests',
                'Advanced analytics dashboard',
                'Bi-weekly strategy',
                'Content 2–4/mo',
              ],
              cta: 'Choose Growth',
              featured: true,
            },
            {
              name: 'Scale — Performance Partner',
              price: '$7,000–$12,000/mo',
              note: 'Multi-channel incl. TikTok/YouTube',
              perks: [
                'Creative sprints',
                'CRO program',
                'RevOps/CRM integration',
                'Dedicated strategist',
              ],
              cta: 'Choose Scale',
            },
          ].map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border ${
                p.featured ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
              } p-6 shadow-sm flex flex-col`}
            >
              <div className="text-sm uppercase tracking-widest text-slate-700 mb-1">{p.name}</div>
              <div className="text-3xl font-extrabold text-slate-900">{p.price}</div>
              <div className="text-xs text-slate-500 mt-1">{p.note}</div>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {p.perks.map((x) => (
                  <li key={x} className="flex gap-2">
                    <Check className="w-4 h-4 mt-0.5 text-blue-700" />
                    {x}
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className={`mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold ${
                  p.featured
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'border border-slate-300 hover:bg-slate-50'
                }`}
              >
                {p.cta} <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-8">FAQ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            {
              q: 'Is ad spend included?',
              a: 'No—media budgets are separate and paid directly to platforms.',
            },
            {
              q: 'How fast can we see results?',
              a: 'Most clients see meaningful improvements in 14–30 days with our Launch Sprint.',
            },
            {
              q: 'Who owns the data and accounts?',
              a: 'You do—always. We build inside your ad accounts and analytics.',
            },
            { q: 'Is there a contract?', a: 'Month-to-month after a 60-day ramp.' },
          ].map((f) => (
            <div key={f.q} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="font-semibold text-slate-900 mb-1">{f.q}</div>
              <p className="text-sm text-slate-700">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="max-w-6xl mx_auto px-4 py-16 md:py-20">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 md:p-10 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl font-bold text-slate-900">Book a Free Strategy Call</h3>
              <p className="text-slate-700 mt-2 max-w-xl">
                Prefer email?{' '}
                <a
                  className="underline decoration-blue-400 hover:text-slate-900"
                  href="mailto:hello@rocketgrowthagency.com"
                >
                  hello@rocketgrowthagency.com
                </a>
                . We reply within one business day.
              </p>
            </div>
            <div className="flex gap-3">
              <a
                href="#"
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 text-white px-5 py-3 font-semibold hover:bg-blue-700"
              >
                <Calendar className="w-4 h-4" /> Schedule Call
              </a>
              <a
                href="mailto:hello@rocketgrowthagency.com"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50"
              >
                <Mail className="w-4 h-4" /> Email Us
              </a>
              <a
                href="tel:+1"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50"
              >
                <Phone className="w-4 h-4" /> Call
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile sticky CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center justify_between gap-3">
        <a
          href="#contact"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-3 font-semibold"
        >
          Book Audit <ArrowRight className="w-4 h-4" />
        </a>
        <a
          href="tel:+1"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-3 font-semibold hover:bg-slate-50"
        >
          <Phone className="w-4 h-4" />
        </a>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-10 text-sm text-slate-600 flex flex-col md:flex-row items-center justify-between gap-4">
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
