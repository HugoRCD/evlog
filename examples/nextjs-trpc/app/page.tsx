'use client'

import { trpc } from '@/lib/trpc-client'

export default function Page() {
  const handlePayment = async () => {
    console.log('Sending sensitive data to API...')
    try {
      await trpc.checkout.process.mutate({ amount: 50, apiKey: 'sk_live_verysecret123' })
      alert('Payment info processed safely!')
    } catch (e) {
      console.error(e)
    }
  }

  const handleBatch = async () => {
    console.log('Sending Batch TRPC request...')
    try {
      await Promise.all([
        trpc.user.getById.query({ id: '99' }),
        trpc.checkout.process.mutate({ amount: 5000, apiKey: 'sk_test_111' }) // Over 1000 will crash
      ])
    } catch (e) {
      alert('Batch handled expected error!')
      console.error(e)
    }
  }

  return (
    <main style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>evlog + Next.js + tRPC</h1>
      <p>Click the buttons below to trigger client-side tRPC requests.</p>
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={handlePayment} style={{ padding: '10px 16px', background: 'blue', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Process Payment (Secure)
        </button>
        <button onClick={handleBatch} style={{ padding: '10px 16px', background: 'red', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Trigger Batch (w/ Error)
        </button>
      </div>
      <p style={{ marginTop: 20, fontSize: 13, color: '#666' }}>
        Check the terminal where you ran <code>npm run dev</code> to verify that the <strong>apiKey</strong> field is safely redacted as <code>[REDACTED]</code> in the logs, and the error stack trace points to the exact procedure.
      </p>
    </main>
  )
}
