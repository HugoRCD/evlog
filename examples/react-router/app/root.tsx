import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import { initLogger, parseError, type EnrichContext } from 'evlog'
import { evlog } from 'evlog/react-router'
import { createPostHogDrain } from 'evlog/posthog'
import type { Route } from './+types/root'

initLogger({
  env: { service: 'react-router-example' },
  pretty: true,
})

export const middleware: Route.MiddlewareFunction[] = [
  evlog({
    exclude: ['/'],
    drain: createPostHogDrain(),
    enrich: (ctx: EnrichContext) => {
      ctx.event.runtime = 'node'
      ctx.event.pid = process.pid
    },
  }),
]

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const parsed = parseError(error)
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <Meta />
        <Links />
      </head>
      <body style={{ fontFamily: 'monospace', background: '#0a0a0a', color: '#e5e5e5', padding: '48px' }}>
        <h1>Error {parsed.status}</h1>
        <p>{parsed.message}</p>
        {parsed.why && <p>Why: {parsed.why}</p>}
        {parsed.fix && <p>Fix: {parsed.fix}</p>}
        {parsed.link && <p><a href={parsed.link} style={{ color: '#60a5fa' }}>Learn more</a></p>}
        <Scripts />
      </body>
    </html>
  )
}

export default function Root() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}
