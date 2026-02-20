<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

const activeTab = ref(0)

const tabs = [
  {
    label: 'Nuxt',
    code: `\`\`\`ts [server/api/checkout.post.ts]
export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  const { cartId } = await readBody(event)

  const cart = await db.findCart(cartId)
  log.set({ cart: { items: cart.items.length, total: cart.total } })

  const charge = await stripe.charge(cart.total)
  log.set({ stripe: { chargeId: charge.id } })

  if (!charge.success) {
    throw createError({
      status: 402,
      message: 'Payment failed',
      why: charge.decline_reason,
      fix: 'Try a different payment method',
    })
  }

  return { orderId: charge.id }
})
\`\`\``,
  },
  {
    label: 'Next.js',
    code: `\`\`\`ts [app/api/checkout/route.ts]
import { withEvlog, useLogger } from '@/lib/evlog'

export const POST = withEvlog(async (req) => {
  const log = useLogger()
  const { cartId } = await req.json()

  const cart = await db.findCart(cartId)
  log.set({ cart: { items: cart.items.length, total: cart.total } })

  const charge = await stripe.charge(cart.total)
  log.set({ stripe: { chargeId: charge.id } })

  if (!charge.success) {
    throw createError({
      status: 402,
      message: 'Payment failed',
      why: charge.decline_reason,
      fix: 'Try a different payment method',
    })
  }

  return Response.json({ orderId: charge.id })
})
\`\`\``,
  },
  {
    label: 'Hono',
    code: `\`\`\`ts [src/checkout.ts]
import { createRequestLogger } from 'evlog'

app.post('/checkout', async (c) => {
  const log = createRequestLogger({ method: 'POST', path: '/checkout' })
  const { cartId } = await c.req.json()

  const cart = await db.findCart(cartId)
  log.set({ cart: { items: cart.items.length, total: cart.total } })

  const charge = await stripe.charge(cart.total)
  log.set({ stripe: { chargeId: charge.id } })

  log.emit()
  return c.json({ orderId: charge.id })
})
\`\`\``,
  },
  {
    label: 'Cloudflare',
    code: `\`\`\`ts [src/worker.ts]
import { initLogger, createRequestLogger } from 'evlog'

initLogger({ service: 'checkout-worker' })

export default {
  async fetch(request, env) {
    const log = createRequestLogger({
      method: request.method,
      path: new URL(request.url).pathname,
    })

    const { cartId } = await request.json()
    const cart = await env.DB.findCart(cartId)
    log.set({ cart: { items: cart.items.length, total: cart.total } })

    log.emit()
    return Response.json({ orderId: cart.id })
  },
}
\`\`\``,
  },
  {
    label: 'Bun',
    code: `\`\`\`ts [scripts/migrate-users.ts]
import { initLogger, createRequestLogger } from 'evlog'

initLogger({ service: 'migrate' })

const log = createRequestLogger({ task: 'user-migration' })

const users = await db.query('SELECT * FROM legacy_users')
log.set({ found: users.length })

for (const user of users) {
  await newDb.upsert({ id: user.id, email: user.email, plan: user.plan })
}

log.set({ migrated: users.length, status: 'complete' })
log.emit()
\`\`\``,
  },
]

const frameworks = [
  { name: 'Nuxt', icon: 'i-simple-icons-nuxtdotjs', tab: 0 },
  { name: 'Next.js', icon: 'i-simple-icons-nextdotjs', tab: 1 },
  { name: 'Hono', icon: 'i-simple-icons-hono', tab: 2 },
  { name: 'Cloudflare', icon: 'i-simple-icons-cloudflare', tab: 3 },
  { name: 'Bun', icon: 'i-simple-icons-bun', tab: 4 },
]
</script>

<template>
  <section class="py-24 md:py-32">
    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5 }"
      :in-view-options="{ once: true }"
      class="mb-10 text-center"
    >
      <div>
        <p class="section-label justify-center">
          Frameworks
        </p>
        <div class="relative">
          <h2 class="section-title">
            Your stack. Covered<span class="text-primary">.</span>
          </h2>
          <h2 aria-hidden="true" class="absolute inset-0 section-title blur-xs animate-pulse">
            Your stack. Covered<span class="text-primary">.</span>
          </h2>
        </div>
        <p class="mt-4 text-sm text-zinc-400 max-w-md mx-auto">
          One module for Nuxt. First-class Next.js support. Standalone API for everything else.
        </p>
      </div>
    </Motion>

    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }"
      :in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.4, delay: 0.1 }"
      :in-view-options="{ once: true }"
      class="mb-8 flex flex-wrap items-center justify-center gap-4 md:gap-6"
    >
      <button
        v-for="fw in frameworks"
        :key="fw.name"
        class="group flex flex-col items-center gap-2.5 px-4 py-3 border outline-none transition-all duration-300"
        :class="activeTab === fw.tab
          ? 'border-accent-blue/30 bg-accent-blue/5'
          : 'border-transparent hover:border-zinc-800'"
        @click="activeTab = fw.tab"
      >
        <UIcon
          :name="fw.icon"
          class="size-10 transition-colors duration-300"
          :class="activeTab === fw.tab ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-400'"
        />
        <span
          class="font-mono text-xs transition-colors duration-300"
          :class="activeTab === fw.tab ? 'text-zinc-300' : 'text-zinc-600 group-hover:text-zinc-400'"
        >
          {{ fw.name }}
        </span>
      </button>
    </Motion>

    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5, delay: 0.2 }"
      :in-view-options="{ once: true }"
      class="mx-auto max-w-3xl"
    >
      <div
        v-for="(tab, idx) in tabs"
        :key="tab.label"
        class="landing-code"
        :class="activeTab === idx ? 'block' : 'hidden'"
      >
        <MDC :value="tab.code" />
      </div>
    </Motion>
  </section>
</template>
