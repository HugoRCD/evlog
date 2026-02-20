<script setup lang="ts">
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)
const activeOutput = ref<'success' | 'error'>('success')
const outputRef = ref<HTMLElement>()

let cycleInterval: ReturnType<typeof setInterval> | undefined
let observer: IntersectionObserver | undefined

const pills = [
  { label: 'Wide events', icon: 'i-lucide-layers' },
  { label: 'Root cause', icon: 'i-lucide-search' },
  { label: 'Fix suggestion', icon: 'i-lucide-wrench' },
]

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  if (!prefersReducedMotion.value && outputRef.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !cycleInterval) {
          cycleInterval = setInterval(() => {
            activeOutput.value = activeOutput.value === 'success' ? 'error' : 'success'
          }, 3500)
        }
      },
      { threshold: 0.3 },
    )
    observer.observe(outputRef.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (cycleInterval) clearInterval(cycleInterval)
})

function setOutput(type: 'success' | 'error') {
  activeOutput.value = type
  if (cycleInterval) {
    clearInterval(cycleInterval)
    cycleInterval = undefined
  }
}
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
        <p class="section-label">
          Simple API
        </p>
        <div class="relative mb-5">
          <h2 class="section-title max-w-2xl">
            Set context.<br>Get answers<span class="text-primary">.</span>
          </h2>
          <div aria-hidden="true" class="absolute inset-0 section-title max-w-2xl blur-xs animate-pulse">
            Set context.<br>Get answers<span class="text-primary">.</span>
          </div>
        </div>
        <p class="max-w-lg text-sm leading-relaxed text-zinc-400">
          Accumulate context with log.set, throw structured errors with why and fix. One wide event captures everything — success or failure.
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <span
            v-for="pill in pills"
            :key="pill.label"
            class="inline-flex items-center gap-1.5 border border-zinc-800 bg-zinc-900/50 px-3 py-1 font-mono text-[11px] text-zinc-400"
          >
            <UIcon :name="pill.icon" class="size-3 text-emerald-500" />
            {{ pill.label }}
          </span>
        </div>
        <NuxtLink to="/getting-started/quick-start" class="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-accent-blue transition-colors">
          Quick start guide
          <UIcon name="i-lucide-arrow-right" class="size-3" />
        </NuxtLink>
      </div>
    </Motion>

    <div class="grid gap-6 lg:grid-cols-2 *:min-w-0">
      <!-- Left: Combined handler code -->
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
            <!-- eslint-disable vue/multiline-html-element-content-newline -->
            <pre><code><span class="text-violet-400">export default</span> <span class="text-amber-400">defineEventHandler</span>(<span class="text-violet-400">async</span> (event) => {
  <span class="text-violet-400">const</span> log = <span class="text-amber-400">useLogger</span>(event)

  log.<span class="text-amber-400">set</span>({ <span class="text-sky-400">user</span>: { <span class="text-sky-400">id</span>: user.id, <span class="text-sky-400">plan</span>: user.plan } })
  log.<span class="text-amber-400">set</span>({ <span class="text-sky-400">cart</span>: { <span class="text-sky-400">items</span>: <span class="text-pink-400">3</span>, <span class="text-sky-400">total</span>: <span class="text-pink-400">9999</span> } })

  <span class="text-violet-400">if</span> (!charge.success) {
    <span class="text-violet-400">throw</span> <span class="text-amber-400">createError</span>({
      <span class="text-sky-400">status</span>: <span class="text-pink-400">402</span>,
      <span class="text-sky-400">why</span>: <span class="text-emerald-400">'Card declined by issuer'</span>,
      <span class="text-sky-400">fix</span>: <span class="text-emerald-400">'Try a different card'</span>,
    })
  }

  <span class="text-violet-400">return</span> { <span class="text-sky-400">orderId</span>: charge.id }
})</code></pre>
            <!-- eslint-enable -->
          </div>
        </div>
      </Motion>

      <!-- Right: Output with 200/402 toggle -->
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5, delay: 0.2 }"
        :in-view-options="{ once: true }"
      >
        <div ref="outputRef" class="h-full overflow-hidden border border-zinc-800 bg-[#0c0c0e]">
          <div class="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div class="flex gap-1.5">
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
              <div class="size-3 rounded-full bg-zinc-700" />
            </div>
            <span class="ml-3 font-mono text-xs text-zinc-600">output</span>
            <div class="ml-auto flex items-center gap-1.5">
              <button
                class="font-mono text-[10px] px-2 py-0.5 border transition-all duration-300 outline-none cursor-pointer"
                :class="activeOutput === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                  : 'border-transparent text-zinc-600 hover:text-zinc-400'"
                @click="setOutput('success')"
              >
                200
              </button>
              <button
                class="font-mono text-[10px] px-2 py-0.5 border transition-all duration-300 outline-none cursor-pointer"
                :class="activeOutput === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-500'
                  : 'border-transparent text-zinc-600 hover:text-zinc-400'"
                @click="setOutput('error')"
              >
                402
              </button>
            </div>
          </div>

          <!-- Stacked outputs — grid trick for stable height -->
          <div class="grid [&>*]:col-start-1 [&>*]:row-start-1">
            <!-- Success output -->
            <div
              class="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto transition-opacity duration-300"
              :class="activeOutput === 'success' ? 'opacity-100' : 'opacity-0 pointer-events-none'"
            >
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

            <!-- Error output -->
            <div
              class="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto transition-opacity duration-300"
              :class="activeOutput === 'error' ? 'opacity-100' : 'opacity-0 pointer-events-none'"
            >
              <div class="mb-3 flex items-baseline gap-3">
                <span class="font-medium text-red-500">ERROR</span>
                <span class="text-violet-400">POST</span>
                <span class="text-amber-400">/api/checkout</span>
                <span class="ml-auto text-red-500">402</span>
              </div>
              <div class="space-y-1 border-l-2 border-red-500/30 pl-4">
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
                <div>
                  <span class="text-sky-400">user</span><span class="text-zinc-600">:</span>
                  <span class="text-zinc-400"> { id: 1842, plan: "pro" }</span>
                </div>
              </div>
              <div class="mt-4 border-t border-zinc-800 pt-3">
                <p class="text-xs text-zinc-500">
                  <span class="text-emerald-500">&#10003;</span> Actionable error with context
                </p>
              </div>
            </div>
          </div>
        </div>
      </Motion>
    </div>
  </section>
</template>
