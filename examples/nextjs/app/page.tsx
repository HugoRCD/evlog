'use client'

import { log, setIdentity, clearIdentity } from 'evlog/next/client'
import { parseError } from 'evlog'

export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: 600 }}>
      <h1>evlog Next.js Example</h1>

      <section>
        <h2>Client Logging</h2>
        <button onClick={() => log.info({ action: 'button_clicked', page: 'home' })}>
          Log Info
        </button>
        <button onClick={() => log.error(new Error('Test error from client'))}>
          Log Error
        </button>
      </section>

      <section>
        <h2>Identity</h2>
        <button onClick={() => setIdentity({ userId: 'usr_123', plan: 'pro' })}>
          Set Identity
        </button>
        <button onClick={() => clearIdentity()}>
          Clear Identity
        </button>
      </section>

      <section>
        <h2>API Routes</h2>
        <button onClick={() => fetch('/api/checkout', { method: 'POST' }).then(r => r.json()).then(console.log)}>
          POST /api/checkout
        </button>
        <button onClick={() => fetch('/api/health').then(r => r.json()).then(console.log)}>
          GET /api/health
        </button>
        <button onClick={async () => {
          try {
            const res = await fetch('/api/error')
            if (!res.ok) throw { data: await res.json(), status: res.status }
          }
          catch (error) {
            const parsed = parseError(error)
            console.log('Parsed error:', parsed)
          }
        }}>
          GET /api/error (parseError demo)
        </button>
      </section>
    </main>
  )
}
