<script setup lang="ts">
import type { TestConfig } from '~/config/tests.config'

const props = defineProps<TestConfig>()

const toast = useToast()

const { execute, isLoading, result, error, status } = useTestRunner(props.id, {
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
    if (props.toastOnError) {
      toast.add({
        ...props.toastOnError,
        color: 'error',
      })
    }
  },
})

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
  try {
    if (props.onClick) {
      await execute(props.onClick)
    } else {
      await execute()
    }
  } catch {
    // Error already handled
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
        v-if="isLoading"
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
