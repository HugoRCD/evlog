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
  <div class="h-full p-3 rounded-lg bg-elevated border border-primary/5 hover:border-primary/10 transition-colors flex flex-col">
    <div class="flex items-center gap-2 mb-2">
      <h3 class="text-sm font-semibold text-highlighted leading-tight truncate">
        {{ label }}
      </h3>
      <UBadge
        v-if="badge"
        :color="badge.color as any"
        variant="subtle"
        class="shrink-0"
      >
        {{ badge.label }}
      </UBadge>
    </div>

    <p v-if="description" class="text-xs text-muted leading-snug mb-3 grow truncate" :title="description">
      {{ description }}
    </p>

    <div class="mt-auto">
      <UButton
        size="sm"
        :color="color as any"
        :loading="isLoading"
        @click="handleClick"
      >
        {{ label }}
      </UButton>
    </div>

    <PlaygroundTestResult
      v-if="showResult"
      :status
      :response="result"
      :error
      compact
      class="mt-3"
    />
  </div>
</template>
