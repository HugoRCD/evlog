<script setup lang="ts">
import { Motion } from 'motion-v'

const activeTab = ref<'code' | 'output'>('code')
const activeErrorTab = ref<'code' | 'output'>('code')
</script>

<template>
  <section class="relative py-32">
    <div class="mx-auto max-w-5xl px-6">
      <Motion
        :initial="{ opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5 }"
        :in-view-options="{ once: true }"
        class="mb-16 text-center"
      >
        <h2 class="editorial-title mb-6 text-3xl font-bold text-highlighted md:text-4xl">
          Simple API<span class="evlog-dot">.</span>
        </h2>
        <p class="mx-auto max-w-xl text-base text-muted">
          Wide events with <code class="rounded bg-zinc-100 px-1 py-0.5 text-sm dark:bg-zinc-800">useLogger</code>. Structured errors with <code class="rounded bg-zinc-100 px-1 py-0.5 text-sm dark:bg-zinc-800">why</code>, <code class="rounded bg-zinc-100 px-1 py-0.5 text-sm dark:bg-zinc-800">fix</code>, and <code class="rounded bg-zinc-100 px-1 py-0.5 text-sm dark:bg-zinc-800">link</code>.
        </p>
      </Motion>

      <div class="grid gap-8 lg:grid-cols-2">
        <Motion
          :initial="{ opacity: 0, y: 20 }"
          :in-view="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.5 }"
          :in-view-options="{ once: true }"
          class="min-w-0"
        >
          <div class="overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
              <div class="flex">
                <button
                  class="px-4 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-evlog-blue focus-visible:ring-inset"
                  :class="activeTab === 'code' ? 'bg-zinc-100 text-highlighted dark:bg-zinc-900' : 'text-muted hover:text-highlighted'"
                  @click="activeTab = 'code'"
                >
                  Code
                </button>
                <button
                  class="px-4 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-evlog-blue focus-visible:ring-inset"
                  :class="activeTab === 'output' ? 'bg-zinc-100 text-highlighted dark:bg-zinc-900' : 'text-muted hover:text-highlighted'"
                  @click="activeTab = 'output'"
                >
                  Output
                </button>
              </div>
              <span class="px-4 text-xs text-muted">Wide Events</span>
            </div>

            <div class="overflow-hidden p-4">
              <div v-show="activeTab === 'code'" class="overflow-x-auto">
                <pre class="text-[13px] leading-relaxed"><code class="text-highlighted"><span class="text-zinc-500">// server/api/checkout.post.ts</span>
<span class="text-violet-500">export default</span> <span class="text-amber-500">defineEventHandler</span>(<span class="text-violet-500">async</span> (event) => {
  <span class="text-violet-500">const</span> log = <span class="text-amber-500">useLogger</span>(event)

  log.<span class="text-amber-500">set</span>({ <span class="text-sky-400">user</span>: { <span class="text-sky-400">id</span>: <span class="text-pink-400">1</span>, <span class="text-sky-400">plan</span>: <span class="text-emerald-400">'pro'</span> } })
  log.<span class="text-amber-500">set</span>({ <span class="text-sky-400">cart</span>: { <span class="text-sky-400">items</span>: <span class="text-pink-400">3</span>, <span class="text-sky-400">total</span>: <span class="text-pink-400">9999</span> } })

  <span class="text-violet-500">return</span> { <span class="text-sky-400">success</span>: <span class="text-violet-500">true</span> }
})</code></pre>
              </div>
              <div v-show="activeTab === 'output'" class="log-output">
                <div class="space-y-1">
                  <div>
                    <span class="log-level">[INFO]</span>
                    <span class="log-method"> POST</span>
                    <span class="log-path"> /api/checkout</span>
                    <span class="log-duration"> (234ms)</span>
                  </div>
                  <div class="pl-4 text-zinc-500">
                    <span class="log-key">user</span>: { <span class="log-key">id</span>: <span class="log-number">1</span>, <span class="log-key">plan</span>: <span class="log-string">'pro'</span> }
                  </div>
                  <div class="pl-4 text-zinc-500">
                    <span class="log-key">cart</span>: { <span class="log-key">items</span>: <span class="log-number">3</span>, <span class="log-key">total</span>: <span class="log-number">9999</span> }
                  </div>
                  <div class="pl-4 text-zinc-500">
                    <span class="log-key">status</span>: <span class="log-number">200</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Motion>

        <Motion
          :initial="{ opacity: 0, y: 20 }"
          :in-view="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.5, delay: 0.1 }"
          :in-view-options="{ once: true }"
          class="min-w-0"
        >
          <div class="overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div class="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800">
              <div class="flex">
                <button
                  class="px-4 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-evlog-blue focus-visible:ring-inset"
                  :class="activeErrorTab === 'code' ? 'bg-zinc-100 text-highlighted dark:bg-zinc-900' : 'text-muted hover:text-highlighted'"
                  @click="activeErrorTab = 'code'"
                >
                  Code
                </button>
                <button
                  class="px-4 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-evlog-blue focus-visible:ring-inset"
                  :class="activeErrorTab === 'output' ? 'bg-zinc-100 text-highlighted dark:bg-zinc-900' : 'text-muted hover:text-highlighted'"
                  @click="activeErrorTab = 'output'"
                >
                  Response
                </button>
              </div>
              <span class="px-4 text-xs text-muted">Structured Errors</span>
            </div>

            <div class="overflow-hidden p-4">
              <div v-show="activeErrorTab === 'code'" class="overflow-x-auto">
                <pre class="text-[13px] leading-relaxed"><code class="text-highlighted"><span class="text-violet-500">throw</span> <span class="text-amber-500">createError</span>({
  <span class="text-sky-400">message</span>: <span class="text-emerald-400">'Payment failed'</span>,
  <span class="text-sky-400">status</span>: <span class="text-pink-400">402</span>,
  <span class="text-sky-400">why</span>: <span class="text-emerald-400">'Card declined by issuer'</span>,
  <span class="text-sky-400">fix</span>: <span class="text-emerald-400">'Try a different payment method'</span>,
  <span class="text-sky-400">link</span>: <span class="text-emerald-400">'https://docs.example.com/payments'</span>
})</code></pre>
              </div>
              <div v-show="activeErrorTab === 'output'" class="log-output overflow-x-auto">
                <pre class="text-[13px] leading-relaxed"><code>{
  <span class="log-key">"statusCode"</span>: <span class="log-number">402</span>,
  <span class="log-key">"message"</span>: <span class="log-string">"Payment failed"</span>,
  <span class="log-key">"data"</span>: {
    <span class="log-key">"why"</span>: <span class="log-string">"Card declined by issuer"</span>,
    <span class="log-key">"fix"</span>: <span class="log-string">"Try a different payment method"</span>,
    <span class="log-key">"link"</span>: <span class="log-string">"https://docs.example.com/payments"</span>
  }
}</code></pre>
              </div>
            </div>
          </div>
        </Motion>
      </div>
    </div>
  </section>
</template>
