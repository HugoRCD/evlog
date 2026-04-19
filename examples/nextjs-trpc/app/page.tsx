'use client'

import { trpc } from '@/lib/trpc-client'

export default function Page() {
  const handleHealthCheck = async () => {
    console.log('Health check...')
    try {
      const result = await trpc.health.check.query()
      alert('Health check: ' + JSON.stringify(result))
    } catch (e) {
      console.error(e)
    }
  }

  const handleGetUser = async () => {
    console.log('Getting user...')
    try {
      const result = await trpc.user.getById.query({ id: '42' })
      alert('User: ' + JSON.stringify(result))
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreatePost = async () => {
    console.log('Creating post...')
    try {
      const result = await trpc.post.create.mutate({ title: 'Hello from Next.js', body: 'This is a test post' })
      alert('Post created: ' + JSON.stringify(result))
    } catch (e) {
      console.error(e)
    }
  }

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
      const results = await Promise.all([
        trpc.user.getById.query({ id: '99' }),
        trpc.health.check.query(),
        trpc.post.create.mutate({ title: 'Batch Post', body: 'Created in batch' })
      ])
      alert('Batch completed: ' + results.length + ' requests')
    } catch (e) {
      alert('Batch handled expected error!')
      console.error(e)
    }
  }

  const handleError = async () => {
    console.log('Triggering error...')
    try {
      await trpc.user.getById.query({ id: 'error' })
    } catch (e) {
      const error = e as Error
      alert('Error triggered: ' + error.message)
      console.error(e)
    }
  }

  const handleBatchTest = async () => {
    console.log('Testing batch endpoint...')
    try {
      const result = await trpc.batch.test.query({ count: 5 })
      alert('Batch test: ' + result.length + ' items generated')
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <main style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>evlog + Next.js + tRPC</h1>
      <p>Click the buttons below to trigger client-side tRPC requests with structured logging.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 20 }}>
        <button onClick={handleHealthCheck} style={{ padding: '10px 16px', background: 'green', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Health Check
        </button>
        <button onClick={handleGetUser} style={{ padding: '10px 16px', background: 'blue', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Get User
        </button>
        <button onClick={handleCreatePost} style={{ padding: '10px 16px', background: 'purple', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Create Post
        </button>
        <button onClick={handlePayment} style={{ padding: '10px 16px', background: 'orange', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Process Payment (Secure)
        </button>
        <button onClick={handleBatch} style={{ padding: '10px 16px', background: 'teal', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Batch Requests
        </button>
        <button onClick={handleError} style={{ padding: '10px 16px', background: 'red', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Trigger Error
        </button>
        <button onClick={handleBatchTest} style={{ padding: '10px 16px', background: 'gray', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' }}>
          Batch Test Endpoint
        </button>
      </div>

      <div style={{ marginTop: 30, fontSize: 13, color: '#666', lineHeight: 1.5 }}>
        <p><strong>What to check:</strong></p>
        <ul>
          <li>Terminal logs show structured events with procedure names and context</li>
          <li>Sensitive data like <code>apiKey</code> is redacted as <code>[REDACTED]</code></li>
          <li>Batch requests show multiple procedure calls with timing</li>
          <li>Errors include full stack traces pointing to the exact procedure</li>
          <li>HTTP drain sends events to your server at <code>http://localhost:8080/ingest</code></li>
        </ul>
      </div>
    </main>
  )
}
