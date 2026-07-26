import Stripe from 'stripe'

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  try {
    await stripe.paymentIntents.create({ amount: 1000, currency: 'usd' })
  }
  catch {}
  return Response.json({ ok: false })
}
