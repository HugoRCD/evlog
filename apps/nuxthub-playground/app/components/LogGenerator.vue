<script setup lang="ts">
import type { AIMetadata } from 'evlog/ai'

interface AiMetadataResponse {
  status: string
  text: string
  metadata: AIMetadata
  estimatedCost: number | undefined
  history: Array<{ step: number, totalTokens: number, estimatedCost: number | undefined }>
}

const lastResult = ref('')
const aiMetadata = ref<AiMetadataResponse | null>(null)
const loadingAiMetadata = ref(false)

async function fire(url: string) {
  try {
    const res = await $fetch(url)
    lastResult.value = `${url} → ${JSON.stringify(res)}`
  } catch (err: any) {
    lastResult.value = `${url} → Error: ${err.statusCode || err.message}`
  }
}

async function fireAll() {
  await Promise.allSettled([
    fire('/api/test/success'),
    fire('/api/test/error'),
    fire('/api/test/warn'),
  ])
}

async function fetchAiMetadata() {
  loadingAiMetadata.value = true
  aiMetadata.value = null
  try {
    aiMetadata.value = await $fetch<AiMetadataResponse>('/api/test/ai-metadata')
  } catch (err: any) {
    lastResult.value = `/api/test/ai-metadata → Error: ${err.statusCode || err.message}`
  } finally {
    loadingAiMetadata.value = false
  }
}

function formatCost(cost: number | undefined): string {
  if (cost === undefined) return '—'
  if (cost === 0) return '$0'
  return `$${cost.toFixed(6)}`
}
</script>

<template>
  <section>
    <h2>Generate Logs</h2>
    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
      <button @click="fire('/api/test/success')">
        Success
      </button>
      <button @click="fire('/api/test/error')">
        Error (500)
      </button>
      <button @click="fire('/api/test/warn')">
        Slow Request
      </button>
      <button @click="fire('/api/test/ai-wrap')">
        AI Wrap Composition
      </button>
      <button @click="fireAll">
        Fire All (x3)
      </button>
    </div>
    <p v-if="lastResult" style="margin-top: 0.5rem; color: #666; font-size: 0.85rem; word-break: break-all; overflow-wrap: anywhere;">
      {{ lastResult }}
    </p>

    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e2e8f0;">
      <h2 style="margin-bottom: 0.25rem;">
        AI Metadata API
      </h2>
      <p style="margin: 0 0 0.5rem; font-size: 0.78rem; color: #718096;">
        Calls <code>generateText</code> and reads back <code>ai.getMetadata()</code>, <code>ai.getEstimatedCost()</code>, and snapshots collected via <code>ai.onUpdate()</code>.
      </p>
      <button :disabled="loadingAiMetadata" @click="fetchAiMetadata">
        {{ loadingAiMetadata ? 'Running...' : 'Run AI metadata demo' }}
      </button>

      <div v-if="aiMetadata" style="margin-top: 0.75rem; display: grid; gap: 0.5rem;">
        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.6rem 0.75rem; background: #f8fafc;">
          <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #718096; margin-bottom: 0.35rem;">
            Final snapshot · ai.getMetadata()
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.25rem 0.75rem; font-size: 0.78rem;">
            <span style="color: #4a5568;">Model</span>
            <code>{{ aiMetadata.metadata.model ?? '—' }}</code>
            <span style="color: #4a5568;">Provider</span>
            <code>{{ aiMetadata.metadata.provider ?? '—' }}</code>
            <span style="color: #4a5568;">Calls</span>
            <code>{{ aiMetadata.metadata.calls }}</code>
            <span style="color: #4a5568;">Input tokens</span>
            <code>{{ aiMetadata.metadata.inputTokens }}</code>
            <span style="color: #4a5568;">Output tokens</span>
            <code>{{ aiMetadata.metadata.outputTokens }}</code>
            <span style="color: #4a5568;">Total tokens</span>
            <code>{{ aiMetadata.metadata.totalTokens }}</code>
            <span style="color: #4a5568;">Finish reason</span>
            <code>{{ aiMetadata.metadata.finishReason ?? '—' }}</code>
            <span style="color: #4a5568;">Estimated cost</span>
            <code>{{ formatCost(aiMetadata.estimatedCost) }}</code>
          </div>
        </div>

        <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.6rem 0.75rem; background: #f8fafc;">
          <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: #718096; margin-bottom: 0.35rem;">
            ai.onUpdate() history · {{ aiMetadata.history.length }} update{{ aiMetadata.history.length === 1 ? '' : 's' }}
          </div>
          <div v-if="aiMetadata.history.length === 0" style="font-size: 0.78rem; color: #a0aec0;">
            No updates received.
          </div>
          <ol v-else style="margin: 0; padding-left: 1.2rem; font-size: 0.78rem; color: #2d3748;">
            <li v-for="(entry, i) in aiMetadata.history" :key="i" style="margin: 0.1rem 0;">
              step {{ entry.step }} · {{ entry.totalTokens }} tokens · {{ formatCost(entry.estimatedCost) }}
            </li>
          </ol>
        </div>

        <details style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.5rem 0.75rem; background: #fff;">
          <summary style="cursor: pointer; font-size: 0.78rem; color: #4a5568;">
            Model output
          </summary>
          <p style="margin: 0.4rem 0 0; font-size: 0.82rem; line-height: 1.45;">
            {{ aiMetadata.text }}
          </p>
        </details>
      </div>
    </div>
  </section>
</template>
