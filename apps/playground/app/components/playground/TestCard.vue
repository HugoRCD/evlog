<script setup lang="ts">
import { parseError } from 'evlog'
import type { TestConfig } from '~/config/tests.config'

const props = defineProps<TestConfig>()

const toast = useToast()

const { execute, result, error, status, reset } = useTestRunner(props.id, {
  endpoint: props.endpoint,
  method: props.method,
  onSuccess: (response) => {
    if (props.toastOnSuccess) {
      toast.add({
        ...props.toastOnSuccess,
        color: 'success',
      })
    }
  },
  onError: (err) => {
    if (props.parseErrorToast) {
      const parsed = parseError(err)
      toast.add({
        title: parsed.message,
        description: parsed.why,
        color: 'error',
        actions: parsed.link
          ? [{ label: 'Learn more', onClick: () => window.open(parsed.link, '_blank') }]
          : undefined,
      })
      if (parsed.fix) {
        console.info(`💡 Fix: ${parsed.fix}`)
      }
    } else if (props.toastOnError) {
      toast.add({
        ...props.toastOnError,
        color: 'error',
      })
    }

    if (props.expectError) {
      reset()
    }
  },
})

const running = ref(false)

const accentColor = computed(() => {
  const map: Record<string, string> = {
    error: 'var(--color-red-500)',
    warning: 'var(--color-amber-500)',
    success: 'var(--color-emerald-500)',
    primary: 'var(--ui-primary)',
    neutral: 'var(--color-zinc-600)',
  }
  return map[props.color || ''] || 'var(--ui-primary)'
})

async function handleClick() {
  if (running.value) return

  running.value = true
  try {
    if (props.onClick) {
      await execute(props.onClick)
    } else {
      await execute()
    }
  } catch {
    // Error already handled via onError / onClick
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div
    class="h-full bg-elevated border border-[var(--ui-border)] border-l-2 flex flex-col"
    :style="{ borderLeftColor: accentColor }"
  >
    <div
      class="p-4 flex-1 flex flex-col cursor-pointer transition-colors hover:bg-white/[0.02] active:bg-white/[0.04] relative"
      @click="handleClick"
    >
      <UIcon
        v-if="running"
        name="i-lucide-loader-circle"
        class="size-3.5 animate-spin text-primary absolute top-4 right-4"
      />

      <UBadge
        v-if="badge"
        color="neutral"
        variant="subtle"
        class="mb-2.5 w-fit"
      >
        {{ badge.label }}
      </UBadge>

      <h3 class="text-sm font-medium text-highlighted leading-snug">
        {{ label }}
      </h3>

      <p v-if="description" class="text-xs text-muted leading-relaxed mt-1.5 line-clamp-2" :title="description">
        {{ description }}
      </p>
    </div>

    <div v-if="showResult" class="px-4 pb-4" @click.stop>
      <PlaygroundTestResult :status :response="result" :error compact />
    </div>
  </div>
</template>
