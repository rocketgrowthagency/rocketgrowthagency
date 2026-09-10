# HANDOFF: build a fully inline, fully branded Stripe checkout

## Context

I'm handing you a working reference implementation from another production app. It takes card
payments **on our own page**, styled to our own design system — no redirect to
`checkout.stripe.com`, no white Stripe-branded page, no hosted billing portal. Subscriptions
with a free trial, one-off purchases, plan switching, cancel/resume, card replacement,
webhooks, and the reconciliation jobs that catch silent money bugs.

Every trap flagged below is one that actually shipped and cost real time or real money. Treat
them as settled, not as suggestions.

Original stack: Next.js (Pages Router API routes + App Router webhook), Supabase (Postgres +
service-role key), Vercel. Adapt paths freely; the patterns are framework-agnostic Node.

---

## Decisions already made — do not re-litigate

| Decision | Reason |
|---|---|
| **Payment Element**, not Checkout (hosted *or* `ui_mode: 'embedded'`) | Hosted Checkout can only be themed via Stripe's Branding settings. The Payment Element takes a full `appearance` object — fonts, radii, focus rings, dark surfaces. It is the only way to make payment look like the product. |
| **The webhook grants; the client never does** | A client reporting success can be wrong, replayed, or lying. The webhook is the only signal money moved. |
| **`redirect: 'if_required'`** | Normal cards finish on the page. Stripe only redirects for a 3DS challenge — you still need a return page for that case. |
| **Card only** (`payment_method_types: ['card']`) | Klarna/ACH/Cash App are noise on a small subscription, and async-settling methods mean a purchase that grants days later — a support ticket, not a feature. Apple Pay, Google Pay and Link all ride on `'card'` anyway. |
| **In-app lifecycle, not the hosted portal** | The portal can't be themed. A subscriber clicking Cancel would leave our dark app for someone else's white page. |

---

## Step 1 — Install and configure

```bash
npm i stripe @stripe/stripe-js @stripe/react-stripe-js
```

Proven versions: `stripe@^22`, `@stripe/stripe-js@^9`, `@stripe/react-stripe-js@^6`.

```bash
STRIPE_SECRET_KEY=sk_live_...          # server only
STRIPE_WEBHOOK_SECRET=whsec_...        # server only — DIFFERENT in test vs live
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...   # client
```

```ts
// server/stripeClient.ts
import StripeSdk from 'stripe';
type StripeInstance = InstanceType<typeof StripeSdk>;
let cached: StripeInstance | null | undefined;

export function getStripe(): StripeInstance | null {
  if (cached !== undefined) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { cached = null; return null; }   // dev/preview without Stripe must not crash
  cached = new StripeSdk(key, {
    // Pin explicitly so Stripe can't break us with a major bump.
    // Cast because the SDK type is generated against a newer version.
    apiVersion: '2024-11-20.acacia' as never,
    typescript: true,
    appInfo: { name: 'your-app', version: '0.1.0' },
  });
  return cached;
}
export function getStripeWebhookSecret() { return process.env.STRIPE_WEBHOOK_SECRET || null; }
```

Return `null` rather than throwing — every route then answers
`{ ok: false, error: 'billing_not_configured' }` and the UI shows "payments launching soon"
instead of a 500.

---

## Step 2 — Customer resolution (two traps here)

Keep your own `stripe_customers` table keyed by `user_id` and read it first.

**Trap A — never call `stripe.customers.search` on a hot path.** It's the indexed Search API:
often seconds, and *eventually consistent*, so a customer created moments ago may not be found
at all. Three sequential search calls on checkout load produced ~15s of "Loading secure
checkout…".

**Trap B — Stripe customer ids are mode-scoped.** A `cus_…` minted in test mode does not exist
in live. Flipping to live keys breaks checkout for everyone who ever transacted in test mode,
and it surfaces as a generic "couldn't start checkout" that says nothing about the cause. One
cheap `retrieve` tells you.

```ts
export async function getOrCreateStripeCustomerId({ userId, email, stripe, sb }): Promise<string> {
  const { data: row } = await sb.from('stripe_customers')
    .select('stripe_customer_id').eq('user_id', userId).is('deleted_at', null).maybeSingle();

  if (row?.stripe_customer_id) {
    const cachedId = row.stripe_customer_id;
    try {
      const existing = await stripe.customers.retrieve(cachedId) as { deleted?: boolean };
      if (!existing?.deleted) return cachedId;                  // fast path
    } catch { /* doesn't exist in this mode */ }
    await sb.from('stripe_customers').update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId).eq('stripe_customer_id', cachedId); // retire the dead mapping
  }

  // Never seen locally — look before creating, or you split their billing history in two.
  let customerId;
  try {
    const found = await stripe.customers.search({ query: `metadata['user_id']:'${userId}'`, limit: 1 });
    customerId = found.data[0]?.id;
  } catch { /* fall through */ }

  if (!customerId) {
    const created = await stripe.customers.create({
      email: email || undefined,
      metadata: { user_id: userId },        // 🔴 the link the webhook depends on
    });
    customerId = created.id;
  }

  await sb.from('stripe_customers').upsert(
    { user_id: userId, stripe_customer_id: customerId, email: email || null,
      updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  return customerId;
}
```

**Also write a read-only twin** (`findStripeCustomerId`) for paths that must never create —
billing summary, cancel, switch-plan, update-card. **Put the mode-scope validation in BOTH.**
We originally added it only to the create path; every read path kept handing dead ids to
Stripe and 502-ing. When two functions do the same lookup, audit them side by side.

---

## Step 3 — One entitlement resolver

The worst bug class here is **two sources of truth**. If checkout asks Stripe and the account
page asks your DB, they will eventually disagree and one screen will say "Free plan" while the
other says "You're already subscribed."

```ts
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];   // past_due = dunning grace

export async function resolveEntitlement({ userId, sb, stripe, stripeCustomerId }) {
  const { data: planRow } = await sb.from('user_plans')
    .select('plan').eq('user_id', userId).maybeSingle();
  const dbPaid = planRow?.plan === 'paid';

  let live;
  if (stripe && stripeCustomerId) {
    try {
      const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 20 });
      live = subs.data.find(s => LIVE_STATUSES.includes(String(s.status)));
    } catch { /* Stripe down must not strand a paying customer on the free tier */ }
  }

  if (live) {
    if (!dbPaid) await repairUserPlan(userId, 'paid');   // heal the mirror, don't just read it
    return { isPaid: true, source: 'stripe', stripeSubscriptionId: live.id };
  }

  // 🔴 Do NOT downgrade here. "No Stripe subscription" is also what a COMPED
  // account looks like, and what a Stripe outage looks like.
  return { isPaid: dbPaid, source: dbPaid ? 'user_plans' : 'none', stripeSubscriptionId: null };
}
```

Every screen calls this. No exceptions.

---

## Step 4 — Subscriptions as two steps

**Do not** create the subscription up front with `payment_behavior: 'default_incomplete'`. That
**does not** hold a trialing subscription in `incomplete` — a trial has nothing to charge, so
Stripe puts it straight into `trialing`, the webhook reads a paid-equivalent status, and the
user gets the full trial **for merely loading the checkout page**. No card, no click, no intent
to buy. That shipped once and granted a test account a month of Premium without a click.

### 4a. `POST /api/billing/subscribe` — SetupIntent only

```ts
const customerId = await getOrCreateStripeCustomerId({ userId, email, stripe, sb });

// Two independent round trips — run together, don't serialise the user's wait.
const [entitlement, intent] = await Promise.all([
  resolveEntitlement({ userId, sb, stripe, stripeCustomerId: customerId }),
  stripe.setupIntents.create({
    customer: customerId,
    usage: 'off_session',
    payment_method_types: ['card'],
    metadata: { user_id: userId, plan },
  }),
]);

if (entitlement.isPaid) {
  stripe.setupIntents.cancel(intent.id).catch(() => {});   // don't leave it on the customer
  return res.json({ ok: false, error: 'already_subscribed' });
}
return res.json({ ok: true, clientSecret: intent.client_secret, mode: 'setup' });
```

### 4b. `POST /api/billing/activate` — create the subscription after the card confirms

```ts
const intent = await stripe.setupIntents.retrieve(setupIntentId);
if (intent.status !== 'succeeded')         return res.status(400).json({ error: 'card_not_confirmed' });
if (intent.metadata?.user_id !== user.id)  return res.status(403).json({ error: 'not_your_setup_intent' });
// ^ without this, anyone holding a SetupIntent id could activate against someone else's card

// Idempotency #1 — the page is reloadable. Same resolver as everywhere else.
const ent = await resolveEntitlement({ userId, sb, stripe, stripeCustomerId: customerId });
if (ent.isPaid && ent.stripeSubscriptionId)
  return res.json({ ok: true, status: 'active', subscriptionId: ent.stripeSubscriptionId });

// Make the confirmed card default so the first invoice can actually be collected.
await stripe.customers.update(customerId, {
  invoice_settings: { default_payment_method: paymentMethodId },
});

// Idempotency #2 — the real one. The check above is NOT atomic with this create:
// a double-click has both requests read "not paid" and both create a subscription,
// billing the customer twice with two live subs on one account. Keying on the
// SetupIntent closes the window at Stripe's end — one SetupIntent activates exactly
// one subscription, so a replay returns the ORIGINAL instead of minting a second.
const sub = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: priceId }],
  default_payment_method: paymentMethodId,
  metadata: { user_id: userId, plan },
  ...(plan === 'monthly' ? {
    trial_period_days: 30,
    trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } },
  } : {}),
}, { idempotencyKey: `activate:${setupIntentId}` });
```

Same route handles **card replacement**: branch on `intent.metadata.purpose === 'update_card'`,
update `invoice_settings.default_payment_method` plus the live subscription's
`default_payment_method`, return without creating anything.

---

## Step 5 — One-off purchases (credit packs / top-ups)

PaymentIntent, **not** a Checkout session — two different payment UIs in one product is a tell
that something is bolted on.

```ts
const intent = await stripe.paymentIntents.create({
  amount: PRICE_CENTS,
  currency: 'usd',
  customer: customerId,
  payment_method_types: ['card'],
  description: '10 hours of X',
  metadata: {
    // 🔴 The webhook reads THESE to decide what to grant. Changing a key here
    // without changing the webhook silently turns purchases into payments that
    // grant nothing.
    kind: 'minutes_topup', user_id: user.id, minutes: String(MINUTES),
  },
}, {
  // A double-click must not create two charges. Scoped per user per minute: a
  // deliberate second purchase a minute later still works; a retry does not.
  idempotencyKey: `topup_${user.id}_${Math.floor(Date.now() / 60000)}`,
});
```

**Nothing is granted here.** The route only takes payment.

---

## Step 6 — The branded front end

Load the SDK once, outside the component:

```tsx
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null;  // injects a script tag
```

The appearance object is the whole point — swap these values for the project's palette:

```ts
const BRAND = '#1ED760';   // ← replace

const appearance: Appearance = {
  theme: 'night',                 // 'stripe' | 'night' | 'flat'
  labels: 'floating',
  variables: {
    colorPrimary: BRAND,
    colorBackground: '#181818',
    colorText: '#ffffff',
    colorTextSecondary: '#B3B3B3',
    colorTextPlaceholder: '#6A6A6A',
    colorDanger: '#ff8a8a',
    fontFamily: '"Space Grotesk", "SF Pro Display", system-ui, sans-serif',   // ← replace
    borderRadius: '12px',
    spacingUnit: '4px',
  },
  rules: {
    '.Input':         { border: '1px solid rgba(255,255,255,.10)', boxShadow: 'none' },
    '.Input:focus':   { border: `1px solid ${BRAND}`, boxShadow: '0 0 0 3px rgba(30,215,96,.16)' },
    '.Tab':           { border: '1px solid rgba(255,255,255,.10)', boxShadow: 'none' },
    '.Tab--selected': { border: `1px solid ${BRAND}`, boxShadow: 'none' },
    '.Label':         { fontWeight: '600' },
  },
};
```

Custom webfonts inside the iframe need `fonts: [{ cssSrc }]` on `<Elements options>`.

```tsx
const options = useMemo(() => (clientSecret ? { clientSecret, appearance } : null), [clientSecret]);

<Elements stripe={stripePromise} options={options}>
  <PaymentForm plan={plan} mode={mode} onConfirmed={onConfirmed} />
</Elements>
```

`Elements` **cannot** have its `clientSecret` changed after mount — render only once you have
the secret; remount with a new `key` if it genuinely changes.

### Confirming without leaving the page

```tsx
async function onSubmit(e) {
  e.preventDefault();
  if (!stripe || !elements) return;
  setSubmitting(true); setError(null);

  // `redirect: 'if_required'` keeps a normal card ON THIS PAGE — no bounce to an
  // interstitial saying "Setting up your plan…" while the nav still reads Free.
  // Stripe only redirects when the bank demands 3DS.
  const return_url = `${window.location.origin}/checkout/complete?plan=${plan}`;
  const result = mode === 'setup'
    ? await stripe.confirmSetup({   elements, confirmParams: { return_url }, redirect: 'if_required' })
    : await stripe.confirmPayment({ elements, confirmParams: { return_url }, redirect: 'if_required' });

  if (result.error) {
    setSubmitting(false);
    setError(result.error.message || 'Something went wrong. Please try again.');
    return;   // Stripe's messages are user-safe — show them verbatim
  }

  const intentId = ('setupIntent' in result && result.setupIntent?.id)
                || ('paymentIntent' in result && result.paymentIntent?.id) || null;

  const activated = await onConfirmed(intentId);   // POST /activate, then navigate
  if (!activated) {
    setSubmitting(false);
    setError('Your card was saved, but we couldn’t start the subscription. Nothing has been charged.');
  }
  // No setSubmitting(false) on success — the button stays in its working state
  // until navigation, which is what a user expects after pressing pay.
}
```

### The 3DS return page

Stripe appends `?setup_intent=…&setup_intent_client_secret=…` (or `payment_intent=…`) to
`return_url`. Hand the **id** to the activate endpoint, which re-verifies server-side before
creating anything. Then **poll your own entitlement endpoint** (1.5s interval, 20s ceiling)
until the plan flips — otherwise the user lands on an account page reading "Free" moments after
subscribing. Ceiling, then continue regardless; never spin forever.

### Two UX details worth copying

**Skeleton, not a spinner.** A skeleton in the shape of the form reads as "almost there"; a
line of text reads as "nothing is happening."

**Prefetch the intent on hover.** Creating the SetupIntent needs a round trip to your API and
then Stripe. Do it on hover/focus of the upgrade button and it's usually done by the time the
page renders — same work, off the critical path. Hover rather than page load, so you aren't
minting Stripe objects for every passing visitor. Cache in `sessionStorage` with a 10-min TTL,
and **key on `userId`** — sessionStorage survives a logout in the same tab and a client secret
must never cross accounts. Use the warm secret **only on the first attempt**; a retry fetches
fresh, in case the cached secret is why it failed.

---

## Step 7 — The webhook (where money becomes product)

```ts
export const runtime = 'nodejs';    // Edge / pre-parsed body breaks signature verification
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature') || '';
  if (!sig) { await logSigFailure(req, 'missing_signature'); return json({ error: 'missing_signature' }, 400); }

  const rawBody = await req.text();   // 🔴 RAW BYTES. Do NOT json-parse before constructEvent.

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    await logSigFailure(req, classify(err));   // persist attempts — this is your abuse signal
    return json({ error: 'invalid_signature' }, 400);
  }
  ...
}
```

On Pages Router you must also `export const config = { api: { bodyParser: false } }` and read
the raw buffer yourself. The App Router `req.text()` form above avoids that entirely — worth
using just for this.

### Durability + a dedupe that actually works

```ts
// 1. Persist first — at-least-once durability plus an audit trail.
await sb.from('stripe_webhook_events').upsert({
  stripe_event_id: event.id, type: event.type, api_version: event.api_version,
  livemode: event.livemode, payload: event, received_at: now, processed: false,
}, { onConflict: 'stripe_event_id', ignoreDuplicates: true });

// 2. ⚠️ ignoreDuplicates SILENCES the conflict but stops NOTHING. Without this read,
//    a redelivered event falls straight through to dispatch again — a second receipt
//    for one charge, a second "trial started". We were writing `processed` on every
//    run and reading it on none: a dedupe that did not exist.
const { data: prior } = await sb.from('stripe_webhook_events')
  .select('processed').eq('stripe_event_id', event.id).maybeSingle();
if (prior?.processed) return json({ received: true, deduped: true });

// 3. dispatch() → mark processed. On throw: record processing_error, return 500 so
//    Stripe retries.
```

### 🔴 Silent dead code

**A `case` for an event you haven't subscribed to in the Stripe dashboard is dead code, and it
fails silently** — the handler never runs and nothing anywhere says so. This left our
subscriptions mirror table empty through an entire test phase.

Export the list from code and diff it against Stripe on a schedule:

```ts
export const HANDLED_STRIPE_EVENTS = [
  'charge.dispute.closed', 'charge.dispute.created', 'charge.dispute.updated',
  'charge.refunded', 'checkout.session.completed',
  'coupon.created', 'coupon.deleted', 'coupon.updated',
  'customer.created', 'customer.deleted', 'customer.updated',
  'customer.subscription.created', 'customer.subscription.deleted',
  'customer.subscription.trial_will_end', 'customer.subscription.updated',
  'invoice.created', 'invoice.finalized', 'invoice.paid',
  'invoice.payment_failed', 'invoice.payment_succeeded', 'invoice.upcoming', 'invoice.voided',
  'payment_intent.canceled', 'payment_intent.payment_failed', 'payment_intent.succeeded',
  'payment_method.attached',
  'price.created', 'price.deleted', 'price.updated',
  'refund.created', 'refund.updated',
] as const;
```

In the dashboard, the event list is behind **Edit destination** — the `⋯` menu only offers
Disable / Roll secret / Delete.

### Granting a purchase — idempotency is the UNIQUE index

```sql
ALTER TABLE user_minute_topups ADD CONSTRAINT uniq_pi UNIQUE (stripe_payment_intent_id);
```

```ts
async function creditTopup(pi, sb) {
  if (pi?.metadata?.kind !== 'minutes_topup') return;
  const userId = pi.metadata?.user_id;
  const minutes = Number.parseInt(pi.metadata?.minutes ?? '', 10);
  if (!userId || !Number.isFinite(minutes) || minutes <= 0) {
    console.error('paid intent we cannot attribute — money taken, nothing given', pi.id);
    return;
  }
  const { error } = await sb.from('user_minute_topups').insert({
    user_id: userId, minutes_delta: minutes, kind: 'purchase',
    amount_cents: pi.amount_received ?? pi.amount ?? null,
    stripe_payment_intent_id: pi.id,
  });
  if (error) {
    if (error.code === '23505') return;   // ⭐ 23505 is the SUCCESS case: already credited
    console.error('CREDIT FAILED — user paid, nothing granted', { intent: pi.id, userId });
    throw error;                           // 500 → Stripe retries
  }
}
```

A read-then-write check still double-credits under concurrent delivery, **and Stripe does
deliver concurrently.** Let the database lose the race, not your application code.

### Plan sync, and the downgrade that must not fail

```ts
async function syncUserPlanFromSubscription(s, sb) {
  let userId = typeof s.metadata?.user_id === 'string' ? s.metadata.user_id : null;

  // ⚠️ This fallback is what makes the DOWNGRADE safe. Subscriptions we create stamp
  // metadata.user_id; one created by hand in the dashboard does not — and returning
  // early means the plan is never flipped in EITHER direction. Granting nothing is
  // survivable; failing to revoke is free product forever.
  if (!userId) userId = await lookupUserIdByCustomer(s.customer, sb);
  if (!userId) { console.warn('no user_id for subscription', s.id); return; }

  const paid = ['active', 'trialing', 'past_due'].includes(String(s.status));
  await setUserPlan(userId, paid ? 'paid' : 'free', sb);
}
```

Mirror writes have the same requirement — **always carry `user_id`**. Writing a customer row
without it nulled the link, the next lookup found nothing, and a **second** Stripe customer was
minted for the same person, splitting their billing history in two:

```ts
const linkedUserId = (typeof c.metadata?.user_id === 'string' && c.metadata.user_id) || undefined;
await sb.from('stripe_customers').upsert({
  stripe_customer_id: c.id,
  ...(linkedUserId ? { user_id: linkedUserId } : {}),   // never overwrite a good link with undefined
  email: c.email, delinquent: c.delinquent ?? false, raw: c,
}, { onConflict: 'stripe_customer_id' });
```

### Billing periods moved onto items

A webhook endpoint carries its **own** API version, fixed when the endpoint was created, which
can differ from the version pinned in your SDK. Reading the top-level field blind produced
`new Date(NaN)`, which **throws** on `.toISOString()` — and because the plan sync ran first,
users flipped to paid while the mirror table silently stopped recording anything.

```ts
function periodBoundary(s, field: 'current_period_start' | 'current_period_end') {
  const top = s[field];
  const fromItem = s.items?.data?.[0]?.[field];
  const seconds = typeof top === 'number' ? top : typeof fromItem === 'number' ? fromItem : null;
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}
```

### Email rules — each one from a real incident

| Rule | Why |
|---|---|
| Email on `invoice.paid` **only** | A successful charge fires **both** `invoice.paid` and `invoice.payment_succeeded`. Handling both = two receipts for one payment. |
| Skip `$0` invoices | A $0 invoice is a trial starting or a full coupon. "You paid $0.00" reads as a mistake. |
| Send "trial started" from `customer.subscription.created` | The trial's $0 invoice is skipped by the rule above — without this the customer hands over a card and hears **nothing**. |
| Use `previous_attributes` on `customer.subscription.updated` | That event fires constantly. It's the only reliable signal of what changed — email strictly on `prev.items` (plan change) or `prev.cancel_at_period_end === true && now false` (resumed). |
| Guard `trial_will_end` on `status === 'trialing'` | Stripe's own warning: a trial shortened to under three days can fire this **immediately**, inside the transaction that collects payment. "Your card will be charged on X" to someone already charged is worse than silence. |
| `charge.refunded`: read `refunds.data[0].amount`, not `amount_refunded` | `amount_refunded` is **cumulative** — a second partial refund emails the running total ("we've refunded $99" when $10 was just returned on top of $89). |
| `payment_method.attached`: only notify if a default card already existed | It also fires on the **first** card at signup, where "your payment method was updated" makes no sense. |
| Retrieve the charge for brand/last4 | Webhook payloads do **not** expand `charge` or `payment_intent` — they arrive as id strings, so reading card details off the invoice found nothing and every receipt said "Card on file". |
| Turn **off** Stripe → Settings → Emails → "Successful payments" | Otherwise the customer gets yours *and* Stripe's for the same charge. |
| Every email call `try/catch`'d, never changes the response | An unguarded throw returns 500, and **Stripe disables an endpoint that keeps failing.** One undeliverable address could take down billing sync for every customer. The mirror write already succeeded; the email is the expendable half. |

---

## Step 8 — In-app lifecycle (replacing the hosted portal)

Four endpoints:

**`GET /api/billing/subscription`** — everything the account page renders.

```ts
const customer = await stripe.customers.retrieve(customerId,
  { expand: ['invoice_settings.default_payment_method'] });
// retrieve() also returns DELETED customers — check .deleted
const subs = await stripe.subscriptions.list({
  customer: customerId, status: 'all', limit: 20, expand: ['data.default_payment_method'] });
const invoices = await stripe.invoices.list({ customer: customerId, limit: 12 });
```

Return `{ subscription: null, card: null, invoices: [] }` for a comped account with no Stripe
customer — not an error, just nothing to bill.

**`POST /api/billing/cancel`** (and `{ resume: true }`).

```ts
// 🔴 Only ever act on the customer's OWN live subscription. The id is NEVER taken
// from the request body.
const live = subs.data.find(s => LIVE_STATUSES.includes(String(s.status)));

if (String(live.status) === 'trialing') {
  // Nothing was paid, so nothing to preserve — and leaving someone on a trial they
  // just cancelled strands them for up to 30 days.
  await stripe.subscriptions.cancel(live.id, { cancellation_details: { comment: reason } });
  await setUserPlan(userId, 'free');   // downgrade NOW, don't wait for the webhook: the
                                       // client reloads immediately and would read the
                                       // still-paid row. The webhook is the backstop.
} else {
  await stripe.subscriptions.update(live.id, { cancel_at_period_end: !resume });  // they bought it, they keep it
}
```

**`POST /api/billing/switch-plan`** — proration differs by direction, deliberately:

- **to annual:** `proration_behavior: 'always_invoice'` + `billing_cycle_anchor: 'now'`. They
  owe the year now, minus credit for the unused month. Deferring leaves them on annual pricing
  without annual cash.
- **to monthly:** `'none'`, effective at period end. Someone who paid for a year must not be
  charged again a month later, nor silently refunded.
- **in trial:** `'none'`, just swap the price. Nothing paid, so nothing to prorate; invoicing
  mid-trial charges someone you promised a free month.

Add a `GET` preview that uses **Stripe's own** upcoming-invoice calculation, never your
arithmetic — a number you invent will eventually disagree with the number actually charged:

```ts
const upcoming = await (stripe.invoices as any).createPreview({
  customer: customerId, subscription: live.id,
  subscription_details: {
    items: [{ id: item.id, price: targetPrice }],
    proration_behavior: 'always_invoice', billing_cycle_anchor: 'now',
  },
});   // → amountDueNow
```

Switching a paying monthly subscriber to annual bills ~a year on the spot. Doing that from a
single unconfirmed click is how chargebacks and "I never agreed to this" happen, **even when
the billing is correct.** Also call it a **switch**, never an "upgrade", when only the interval
changes — "upgrade" implies more product, and the moment someone notices it isn't, the wording
reads as a trick.

**`POST /api/billing/payment-method`** — a SetupIntent with
`metadata: { purpose: 'update_card' }`; the shared activate handler branches on it and swaps the
default instead of starting a subscription.

---

## Step 9 — Reconciliation jobs

The webhook is the **only** path from "customer paid" to "customer has the thing." Stripe
retries ~3 days; an endpoint down longer, a handler that threw past its retries, or an event
never subscribed all produce the same permanent, silent leak. Two scheduled jobs close it, with
**deliberately opposite** enforcement postures:

**Grant reconciler — enforces by default.** Every succeeded PaymentIntent tagged with your
`kind` in the last 7 days must have a ledger row; write the ones that don't. The risky action
here is *doing nothing* — the customer already paid. Double-granting is impossible because the
payment-intent id is UNIQUE.

**Revoke reconciler — reports only, until you opt in.** `resolveEntitlement` deliberately never
downgrades (a comped account is indistinguishable from a lapsed one), so a missed
`customer.subscription.deleted` means free product forever. But revoking is user-facing and
irreversible from the customer's side, and a bug here cuts off paying customers — the exact
failure inverted. Run report-only, read the numbers for a week, *then* set the enforce flag.
Bolt card-expiry warnings onto the same sweep: an expired card isn't a decision to leave, it's
a date passing.

Both should also diff `HANDLED_STRIPE_EVENTS` against the live endpoint config.

```ts
function isAuthorizedCron(req) {
  if (req.headers['user-agent']?.toString().startsWith('vercel-cron/')) return true;
  const auth = req.headers.authorization?.replace(/^Bearer\s+/, '');
  return Boolean(CRON_SECRET && auth === CRON_SECRET);
}
```

**🔴 An empty table is not evidence of a missing subscription.** This nearly caused a wrong
diagnosis in reverse: zero `payment_intent.succeeded` rows led to "event unsubscribed, feature
broken." It wasn't — gross volume was $0.00, nothing had ever been charged, and **$0 trial
invoices don't create PaymentIntents.** There was no input. Check the source-of-truth list at
Stripe before declaring a pipe broken.

---

## Step 10 — Schema

```
stripe_customers        (user_id UNIQUE, stripe_customer_id, email, delinquent, deleted_at, raw)
stripe_subscriptions    (stripe_subscription_id PK, stripe_customer_id, status,
                         cancel_at_period_end, current_period_start/end, canceled_at, raw)
stripe_invoices         (stripe_invoice_id PK, amount_due_cents, amount_paid_cents,
                         hosted_invoice_url, invoice_pdf, paid_at, raw)
stripe_payment_intents  (stripe_payment_intent_id PK, amount_cents, status, raw)
stripe_refunds          (stripe_refund_id PK, stripe_charge_id, amount_cents, reason)
stripe_disputes         (stripe_dispute_id PK, amount_cents, status, evidence_due_by)
stripe_prices           (stripe_price_id PK, unit_amount_cents, recurring_interval, active)
stripe_coupons          (stripe_coupon_id PK, percent_off, amount_off_cents, times_redeemed)
stripe_webhook_events   (stripe_event_id UNIQUE, type, livemode, payload jsonb,
                         processed bool, processed_at, processing_error)
webhook_signature_failures (provider, endpoint_path, failure_reason, source_ip_hash, user_agent)

user_plans          (user_id UNIQUE, plan 'free'|'paid', status)              ← gating mirror
user_minute_topups  (user_id, minutes_delta, stripe_payment_intent_id UNIQUE) ← grant ledger
```

Keep a `raw jsonb` column on every mirror table. When a payload shape shifts under you, that
column is the difference between a five-minute answer and re-creating the incident.

---

## Error-handling posture

```ts
// Stripe's own message names internal object ids — not for end users. But a generic
// 'checkout_failed' cost an hour when the real error was "No such price" from a
// misconfigured env. So: admins get `detail`, everyone else gets the code.
const isAdmin = ADMIN_EMAILS.includes((user.email || '').toLowerCase());
return res.status(502).json({ ok: false, error: 'checkout_failed', ...(isAdmin ? { detail } : {}) });
```

Front-end copy after a failure must state the money position explicitly — **"Nothing has been
charged"** — because the first thing a user does otherwise is retry, and the second is dispute.

---

## Definition of done

- [ ] Live keys in every environment (`sk_`, `pk_`, `whsec_`, both `price_` ids).
- [ ] Live-mode webhook endpoint created — **different signing secret** than test.
- [ ] Every event in `HANDLED_STRIPE_EVENTS` subscribed on the live endpoint (Edit destination).
- [ ] Mode-scope validation present in **both** the create path and the read-only twin.
- [ ] Stripe → Settings → Emails → "Successful payments" off if you send your own receipts.
- [ ] Reconcilers scheduled; revoke-side report-only for the first week.
- [ ] Tested: full page reload mid-checkout · double-click on pay · 3DS card
      `4000 0025 0000 3155` · declined `4000 0000 0000 0002` · webhook redelivery from the
      dashboard.
- [ ] Receipt shows real card brand + last4, not "Card on file".

---

## The five rules, if you read nothing else

1. **The client never grants anything.** The webhook is the only proof money moved.
2. **Idempotency lives in the database (UNIQUE) and at Stripe (`idempotencyKey`)** — never in a
   check-then-write, which loses under concurrent delivery.
3. **One entitlement resolver.** Two sources of truth is the defect; a stray subscription is
   only what exposes it.
4. **A `case` for an unsubscribed event is silent dead code.** Diff the handler list against
   Stripe on a schedule.
5. **Never downgrade on absence.** No subscription also means comped, or Stripe being down.
   Revoke from an explicit signal, reconciled deliberately.
