import Stripe from 'stripe'

export async function POST() {
  const stripe = new Stripe('sk_test')
  try {
    await stripe.paymentIntents.create({ amount: 1000, currency: 'usd' })
  }
  catch {}
  return Response.json({ ok: false })
}
