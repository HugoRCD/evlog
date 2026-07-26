import Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  try {
    await stripe.checkout.sessions.create({})
  }
  catch {}
  return { ok: true }
})
