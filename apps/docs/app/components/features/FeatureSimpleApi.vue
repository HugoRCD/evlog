<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})
</script>

<template>
  <section class="py-24 md:py-32">
    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5 }"
      :in-view-options="{ once: true }"
      class="mb-10"
    >
      <div>
        <p class="section-label">Simple API</p>
        <div class="relative">
          <h2 class="section-title max-w-2xl">
            Three lines of code.<br>Full observability<span class="text-primary">.</span>
          </h2>
          <h2 aria-hidden="true" class="absolute inset-0 section-title max-w-2xl blur-xs animate-pulse">
            Three lines of code.<br>Full observability<span class="text-primary">.</span>
          </h2>
        </div>
      </div>
    </Motion>

    <div class="grid gap-6 lg:grid-cols-2">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.1 }"
        :in-view-options="{ once: true }"
      >
        <div class="h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">checkout.post.ts</span>
          </div>
          <div class="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
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
        <div class="h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">output</span>
            <span class="ml-auto font-mono text-xs text-emerald-500">INFO</span>
          </div>
          <div class="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
            <div class="mb-3 flex items-baseline gap-3">
              <span class="font-medium text-emerald-500">INFO</span>
              <span class="text-violet-400">POST</span>
              <span class="text-amber-400">/api/checkout</span>
              <span class="ml-auto text-zinc-600">(234ms)</span>
            </div>
            <div class="space-y-1 border-l-2 border-zinc-800 pl-4">
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
            <div class="mt-4 border-t border-zinc-800 pt-3">
              <p class="text-xs text-zinc-500">
                <span class="text-emerald-500">&#10003;</span> One log with full context
              </p>
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </section>
</template>
