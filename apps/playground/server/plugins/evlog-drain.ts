// import { createAxiomDrain } from 'evlog/axiom'
// import { createPostHogDrain } from 'evlog/posthog'
// import { createSentryDrain } from 'evlog/sentry'
// import { createBetterStackDrain } from 'evlog/better-stack'
// import { createDatadogDrain } from 'evlog/datadog'
import { auditOnly, signed } from 'evlog'
import { createFsDrain } from 'evlog/fs'

export default defineNitroPlugin((nitroApp) => {
  // Main drain: every wide event lands here. In a real app this would be Axiom,
  // Datadog, PostHog, etc. — observability storage with sampling and 30-90 day retention.
  const main = createFsDrain()

  // Audit sink: tamper-evident, append-only, only receives events that carry an
  // `audit` field. `signed({ strategy: 'hash-chain' })` adds prevHash + hash so
  // the sequence is verifiable. `await: true` blocks the request until the audit
  // is flushed — you don't want to lose audits on crash.
  const auditSink = auditOnly(
    signed(createFsDrain({ dir: '.audit/' }), { strategy: 'hash-chain' }),
    { await: true },
  )

  nitroApp.hooks.hook('evlog:drain', async (ctx) => {
    await Promise.all([main(ctx), auditSink(ctx)])
  })
})
