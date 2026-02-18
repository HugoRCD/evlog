<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <UPageSection :ui="{ container: 'gap-0 lg:gap-0'}">
    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5 }"
      :in-view-options="{ once: true }"
      class="mb-12"
    >
      <p class="section-label mb-4 font-pixel text-xs uppercase tracking-widest text-muted">
        Simple API
      </p>
      <h2 class="section-title max-w-2xl">
        Three lines of code.<br>Full observability<span class="text-primary">.</span>
      </h2>
    </Motion>

    <div class="grid gap-6 lg:grid-cols-2">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.1 }"
        :in-view-options="{ once: true }"
      >
        <div class="dark h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">checkout.post.ts</span>
          </div>
          <div class="p-5 font-mono text-sm leading-relaxed">
            <pre><code><span class="text-violet-400">export default</span> <span class="text-amber-400">defineEventHandler</span>(<span class="text-violet-400">async</span> (event) => {
  <span class="text-violet-400">const</span> log = <span class="text-amber-400">useLogger</span>(event)

  log.<span class="text-amber-400">set</span>({ <span class="text-sky-400">user</span>: { <span class="text-sky-400">id</span>: user.id, <span class="text-sky-400">plan</span>: user.plan } })
  log.<span class="text-amber-400">set</span>({ <span class="text-sky-400">cart</span>: { <span class="text-sky-400">items</span>: <span class="text-pink-400">3</span>, <span class="text-sky-400">total</span>: <span class="text-pink-400">9999</span> } })

  <span class="text-violet-400">return</span> { <span class="text-sky-400">success</span>: <span class="text-violet-400">true</span> }
})</code></pre>
          </div>
        </div>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.2 }"
        :in-view-options="{ once: true }"
      >
        <div class="dark h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">output</span>
            <span class="ml-auto font-mono text-xs text-emerald-500">INFO</span>
          </div>
          <div class="p-5 font-mono text-sm leading-relaxed">
            <div class="mb-3 flex items-baseline gap-3">
              <span class="text-emerald-500 font-medium">INFO</span>
              <span class="text-violet-400">POST</span>
              <span class="text-amber-400">/api/checkout</span>
              <span class="ml-auto text-zinc-600">(234ms)</span>
            </div>
            <div class="space-y-1 pl-4 border-l-2 border-zinc-800">
              <div>
                <span class="text-sky-400">user</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> { id: 1842, plan: "pro" }</span>
              </div>
              <div>
                <span class="text-sky-400">cart</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> { items: 3, total: 9999 }</span>
              </div>
              <div>
                <span class="text-sky-400">status</span><span class="text-zinc-600">:</span>
                <span class="text-emerald-400"> 200</span>
              </div>
              <div>
                <span class="text-sky-400">requestId</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-500"> "req_8f2k..."</span>
              </div>
            </div>
            <div class="mt-4 pt-3 border-t border-zinc-800">
              <p class="text-xs text-zinc-500">
                <span class="text-emerald-500">✓</span> One log with full context
              </p>
            </div>
          </div>
        </div>
      </Motion>
    </div>

    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5, delay: 0.3 }"
      :in-view-options="{ once: true }"
      class="mt-24"
    >
      <p class="section-label mb-4 font-pixel text-xs uppercase tracking-widest text-muted">
        Structured Errors
      </p>
      <h3 class="section-title max-w-lg mb-6">
        Errors that explain why<span class="text-primary">.</span>
      </h3>
    </Motion>

    <div class="grid gap-6 lg:grid-cols-2">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.4 }"
        :in-view-options="{ once: true }"
      >
        <div class="dark h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">payment.post.ts</span>
          </div>
          <div class="p-5 font-mono text-sm leading-relaxed">
            <pre><code><span class="text-violet-400">throw</span> <span class="text-amber-400">createError</span>({
  <span class="text-sky-400">message</span>: <span class="text-emerald-400">'Payment failed'</span>,
  <span class="text-sky-400">status</span>: <span class="text-pink-400">402</span>,
  <span class="text-sky-400">why</span>: <span class="text-emerald-400">'Card declined by issuer'</span>,
  <span class="text-sky-400">fix</span>: <span class="text-emerald-400">'Try a different card'</span>,
})</code></pre>
          </div>
        </div>
      </Motion>

      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.5 }"
        :in-view-options="{ once: true }"
      >
        <div class="dark h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">output</span>
            <span class="ml-auto font-mono text-xs text-red-500">ERROR</span>
          </div>
          <div class="p-5 font-mono text-sm leading-relaxed">
            <div class="mb-3 flex items-baseline gap-3">
              <span class="text-red-500 font-medium">ERROR</span>
              <span class="text-violet-400">POST</span>
              <span class="text-amber-400">/api/payment</span>
              <span class="ml-auto text-red-500">402</span>
            </div>
            <div class="space-y-1 pl-4 border-l-2 border-red-500/30">
              <div>
                <span class="text-sky-400">message</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> "Payment failed"</span>
              </div>
              <div>
                <span class="text-sky-400">why</span><span class="text-zinc-600">:</span>
                <span class="text-zinc-400"> "Card declined by issuer"</span>
              </div>
              <div>
                <span class="text-sky-400">fix</span><span class="text-zinc-600">:</span>
                <span class="text-emerald-400"> "Try a different card"</span>
              </div>
            </div>
            <div class="mt-4 pt-3 border-t border-zinc-800">
              <p class="text-xs text-zinc-500">
                <span class="text-emerald-500">✓</span> Actionable error messages
              </p>
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </UPageSection>
</template>
