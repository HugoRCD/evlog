<script setup lang="ts">
const props = defineProps<{
  status: 'idle' | 'loading' | 'success' | 'error'
  response?: any
  error?: any
  compact?: boolean
}>()

const copied = ref(false)

const displayData = computed(() => {
  if (props.response !== undefined) {
    return JSON.stringify(props.response, null, 2)
  }
  if (props.error) {
    return JSON.stringify(props.error, null, 2)
  }
  return null
})

async function copyToClipboard() {
  if (displayData.value) {
    try {
      await navigator.clipboard.writeText(displayData.value)
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }
}
</script>

<template>
  <div
    v-if="status !== 'idle' && displayData"
    class="mt-3 space-y-2"
  >
    <div class="flex items-center justify-between">
      <span class="text-xs font-medium text-muted">
        {{ status === 'error' ? 'Error' : 'Response' }}
      </span>
      <UButton
        v-if="!compact"
        size="xs"
        variant="ghost"
        :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
        @click="copyToClipboard"
      >
        {{ copied ? 'Copied!' : 'Copy' }}
      </UButton>
    </div>
    <pre
      :class="[
        'text-xs p-3 rounded overflow-auto',
        status === 'error'
          ? 'bg-error/10 text-error border border-error/20'
          : 'bg-muted',
        compact ? 'max-h-32' : 'max-h-64',
      ]"
    >{{ displayData }}</pre>
  </div>
</template>
