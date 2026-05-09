<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { WideEvent } from 'evlog'

definePageMeta({ layout: false })
useHead({ title: 'evlog stream — live events' })

interface Envelope {
  evlog: '1'
  type: 'event' | 'replay' | 'ping' | 'hello'
  data: unknown
}

const events = shallowRef<WideEvent[]>([])
const status = ref<'connecting' | 'connected' | 'error'>('connecting')
const helloPayload = ref<{ evlogVersion: string; bufferSize?: number; heartbeatMs?: number } | null>(null)
const search = ref('')
const levelFilter = ref<'' | 'info' | 'warn' | 'error' | 'debug'>('')
const paused = ref(false)
const droppedWhilePaused = ref(0)
const selected = ref<WideEvent | null>(null)
const lastPing = ref<number | null>(null)

let es: EventSource | null = null

function pushEvent(event: WideEvent) {
  if (paused.value) {
    droppedWhilePaused.value++
    return
  }
  events.value = [event, ...events.value].slice(0, 500)
}

function actionLabel(event: WideEvent) {
  const e = event as Record<string, unknown>
  return (e.action as string) ?? (e.message as string) ?? (e.path as string) ?? ''
}

function eventMatches(event: WideEvent) {
  if (levelFilter.value && event.level !== levelFilter.value) return false
  const q = search.value.trim().toLowerCase()
  if (!q) return true
  try {
    return JSON.stringify(event).toLowerCase().includes(q)
  } catch {
    return false
  }
}

const filtered = computed(() => events.value.filter(eventMatches))

function fireDemoRequest(path: string) {
  $fetch(path).catch(() => {})
}

onMounted(() => {
  es = new EventSource('/api/_evlog/stream')

  es.onopen = () => {
    status.value = 'connected' 
  }
  es.onerror = () => {
    status.value = 'error' 
  }
  es.onmessage = (e) => {
    let envelope: Envelope
    try {
      envelope = JSON.parse(e.data)
    } catch {
      return
    }
    if (envelope.evlog !== '1') return
    if (envelope.type === 'hello') {
      helloPayload.value = envelope.data as typeof helloPayload.value
      return
    }
    if (envelope.type === 'event' || envelope.type === 'replay') {
      pushEvent(envelope.data as WideEvent)
    }
  }

  es.addEventListener('ping', () => {
    lastPing.value = Date.now()
  })
})

onBeforeUnmount(() => {
  es?.close()
})
</script>

<template>
  <div class="flex h-dvh bg-default text-default text-[13px]">
    <aside class="w-72 shrink-0 border-r border-default flex flex-col">
      <div class="px-4 pt-5 pb-3">
        <NuxtLink to="/" class="text-[11px] text-muted hover:text-default">
          ← back
        </NuxtLink>
        <h1 class="mt-2 text-sm font-semibold tracking-tight">
          evlog stream
        </h1>
        <p class="text-[11px] text-muted mt-0.5">
          Live SSE feed
        </p>
      </div>

      <div class="px-4 pb-3 space-y-2 text-[11px] text-muted">
        <div class="flex items-center gap-2">
          <span
            class="size-2 rounded-full"
            :class="{
              'bg-green-500': status === 'connected',
              'bg-yellow-500': status === 'connecting',
              'bg-red-500': status === 'error',
            }"
          />
          <span class="capitalize">{{ status }}</span>
          <span v-if="helloPayload" class="ml-auto opacity-60">v{{ helloPayload.evlogVersion }}</span>
        </div>
        <div class="grid grid-cols-2 gap-2 tabular-nums">
          <div class="rounded border border-default px-2 py-1">
            <div class="opacity-60">
              total
            </div>
            <div class="text-default text-sm">
              {{ events.length }}
            </div>
          </div>
          <div class="rounded border border-default px-2 py-1">
            <div class="opacity-60">
              visible
            </div>
            <div class="text-default text-sm">
              {{ filtered.length }}
            </div>
          </div>
        </div>
        <div v-if="lastPing" class="text-[10px] opacity-60">
          last ping: {{ new Date(lastPing).toLocaleTimeString() }}
        </div>
      </div>

      <div class="px-4 pb-3 border-t border-default pt-3 space-y-2">
        <div class="text-[10px] uppercase tracking-wider text-muted">
          Fire demo events
        </div>
        <button
          class="w-full text-left text-[12px] px-2 py-1 rounded border border-default hover:bg-elevated"
          @click="fireDemoRequest('/api/test/wide-event')"
        >
          GET /api/test/wide-event
        </button>
        <button
          class="w-full text-left text-[12px] px-2 py-1 rounded border border-default hover:bg-elevated"
          @click="fireDemoRequest('/api/test/error')"
        >
          GET /api/test/error
        </button>
        <button
          class="w-full text-left text-[12px] px-2 py-1 rounded border border-default hover:bg-elevated"
          @click="fireDemoRequest('/api/test/h3-error')"
        >
          GET /api/test/h3-error
        </button>
        <button
          class="w-full text-left text-[12px] px-2 py-1 rounded border border-default hover:bg-elevated"
          @click="fireDemoRequest('/api/test/catalog/payment-declined')"
        >
          GET /api/test/catalog/payment-declined
        </button>
      </div>

      <div class="mt-auto px-4 pb-4 pt-3 border-t border-default">
        <div class="text-[10px] uppercase tracking-wider text-muted mb-2">
          API
        </div>
        <pre class="text-[10px] leading-relaxed bg-elevated rounded p-2 overflow-x-auto"><code>// Subscribe via fetch
const es = new EventSource(
  '/api/_evlog/stream'
)
es.onmessage = (e) =&gt; {
  const env = JSON.parse(e.data)
  if (env.type === 'event')
    handle(env.data)
}</code></pre>
      </div>
    </aside>

    <main class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center gap-2 px-4 py-2 border-b border-default">
        <input
          v-model="search"
          type="search"
          placeholder="filter events…"
          class="flex-1 px-2 py-1 text-[12px] bg-elevated border border-default rounded outline-none focus:border-primary"
        >
        <select
          v-model="levelFilter"
          class="px-2 py-1 text-[12px] bg-elevated border border-default rounded outline-none focus:border-primary"
        >
          <option value="">
            all levels
          </option>
          <option value="info">
            info
          </option>
          <option value="warn">
            warn
          </option>
          <option value="error">
            error
          </option>
          <option value="debug">
            debug
          </option>
        </select>
        <button
          class="px-2 py-1 text-[12px] border border-default rounded hover:bg-elevated"
          :class="{ 'bg-primary/10 text-primary border-primary': paused }"
          @click="paused = !paused"
        >
          {{ paused ? `paused (${droppedWhilePaused})` : 'pause' }}
        </button>
        <button
          class="px-2 py-1 text-[12px] border border-default rounded hover:bg-elevated"
          @click="events = []; selected = null; droppedWhilePaused = 0"
        >
          clear
        </button>
      </div>

      <div class="flex flex-1 min-h-0">
        <div class="flex-1 overflow-y-auto">
          <table class="w-full">
            <thead class="text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th class="text-left px-3 py-2 font-normal w-24">
                  time
                </th>
                <th class="text-left px-3 py-2 font-normal w-16">
                  level
                </th>
                <th class="text-left px-3 py-2 font-normal w-32">
                  service
                </th>
                <th class="text-left px-3 py-2 font-normal w-16">
                  status
                </th>
                <th class="text-left px-3 py-2 font-normal">
                  action / path
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(event, idx) in filtered"
                :key="`${event.timestamp}-${idx}`"
                class="border-t border-default cursor-pointer hover:bg-elevated"
                :class="{ 'bg-primary/5': selected === event }"
                @click="selected = event"
              >
                <td class="px-3 py-1.5 text-[11px] tabular-nums text-muted">
                  {{ new Date(event.timestamp).toLocaleTimeString() }}
                </td>
                <td class="px-3 py-1.5">
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded"
                    :class="{
                      'bg-blue-500/10 text-blue-500': event.level === 'info',
                      'bg-yellow-500/10 text-yellow-500': event.level === 'warn',
                      'bg-red-500/10 text-red-500': event.level === 'error',
                      'bg-purple-500/10 text-purple-500': event.level === 'debug',
                    }"
                  >
                    {{ event.level }}
                  </span>
                </td>
                <td class="px-3 py-1.5 text-[11px] truncate max-w-32 text-muted">
                  {{ event.service }}
                </td>
                <td class="px-3 py-1.5 text-[11px] tabular-nums text-muted">
                  {{ (event as Record<string, unknown>).status ?? '' }}
                </td>
                <td class="px-3 py-1.5 text-[11px] truncate">
                  {{ actionLabel(event) }}
                </td>
              </tr>
              <tr v-if="filtered.length === 0">
                <td colspan="5" class="text-center text-muted py-12 text-[12px]">
                  Waiting for events… click a demo button on the left or hit any route to generate one.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <aside v-if="selected" class="w-96 shrink-0 border-l border-default overflow-y-auto p-4">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-[10px] uppercase tracking-wider text-muted">
              Wide event
            </h2>
            <button class="text-[11px] text-muted hover:text-default" @click="selected = null">
              ✕
            </button>
          </div>
          <pre class="text-[11px] leading-relaxed font-mono whitespace-pre-wrap wrap-break-word"><code>{{ JSON.stringify(selected, null, 2) }}</code></pre>
        </aside>
      </div>
    </main>
  </div>
</template>
