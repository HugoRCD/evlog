import Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const stripe = new Stripe('sk_test')
  try {
    await stripe.checkout.sessions.create({})
  }
  catch {}
  return { ok: true }
})
