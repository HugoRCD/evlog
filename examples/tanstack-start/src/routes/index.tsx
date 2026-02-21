import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  User,
  ShoppingCart,
  Package,
  ShieldAlert,
  Terminal,
} from 'lucide-react'

export const Route = createFileRoute('/')({ component: Demo })

const methodColors: Record<string, { bg: string, text: string }> = {
  GET: { bg: 'bg-emerald-900/50', text: 'text-emerald-400' },
  POST: { bg: 'bg-blue-900/50', text: 'text-blue-400' },
  PUT: { bg: 'bg-amber-900/50', text: 'text-amber-400' },
}

const endpoints = [
  {
    method: 'GET' as const,
    path: '/api/hello',
    desc: 'Fetch user profile with caching',
    icon: User,
  },
  {
    method: 'GET' as const,
    path: '/api/order',
    desc: 'Rich wide event — user, cart, payment, fraud, flags',
    icon: Package,
  },
  {
    method: 'POST' as const,
    path: '/api/checkout',
    desc: 'Payment fails with structured error (402)',
    icon: ShoppingCart,
    body: {
      userId: 'user_123',
      plan: 'pro',
      items: [
        { name: 'Widget Pro', price: 4999 },
        { name: 'Widget Mini', price: 1999 },
        { name: 'Adapter Kit', price: 999 },
      ],
      coupon: 'WINTER25',
    },
  },
  {
    method: 'PUT' as const,
    path: '/api/admin',
    desc: 'Permission denied with structured error (403)',
    icon: ShieldAlert,
    body: {
      resourceId: 'res_abc123',
      changes: { name: 'Updated name', status: 'active' },
    },
  },
]

function Demo() {
  const [result, setResult] = useState<{
    method: string
    path: string
    status: number
    body: unknown
  } | null>(null)
  const [loading, setLoading] = useState<number | null>(null)

  async function fire(ep: (typeof endpoints)[number], index: number) {
    setLoading(index)
    try {
      const res = await fetch(ep.path, {
        method: ep.method,
        ...(ep.body
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(ep.body),
            }
          : {}),
      })
      const json = await res.json()
      setResult({ method: ep.method, path: ep.path, status: res.status, body: json })
    } catch (err) {
      setResult({ method: ep.method, path: ep.path, status: 0, body: String(err) })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <Terminal className="w-8 h-8 text-cyan-400" />
          <h1 className="text-3xl font-bold text-white">evlog Demo</h1>
        </div>
        <p className="text-gray-400 mb-8">
          Click an endpoint to test it. Check your terminal for wide event logs.
        </p>

        <div className="flex flex-col gap-3">
          {endpoints.map((ep, i) => {
            const Icon = ep.icon
            const colors = methodColors[ep.method]
            return (
              <button
                key={`${ep.method}-${ep.path}`}
                onClick={() => fire(ep, i)}
                disabled={loading === i}
                className="flex items-center gap-4 p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-cyan-500/50 transition-all cursor-pointer text-left"
              >
                <Icon className="w-5 h-5 text-cyan-400 shrink-0" />
                <span
                  className={`text-xs font-mono font-semibold px-2 py-0.5 rounded ${colors.bg} ${colors.text}`}
                >
                  {ep.method}
                </span>
                <span className="font-mono text-sm text-white">{ep.path}</span>
                <span className="text-gray-500 text-xs ml-auto">{ep.desc}</span>
                {loading === i && (
                  <span className="text-gray-500 text-xs animate-pulse">...</span>
                )}
              </button>
            )
          })}
        </div>

        {result && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-gray-500">
                {result.method} {result.path}
              </span>
              <span
                className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                  result.status < 400
                    ? 'bg-emerald-900/50 text-emerald-400'
                    : 'bg-red-900/50 text-red-400'
                }`}
              >
                {result.status}
              </span>
            </div>
            <pre className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-sm font-mono text-gray-300 overflow-x-auto">
              {JSON.stringify(result.body, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
