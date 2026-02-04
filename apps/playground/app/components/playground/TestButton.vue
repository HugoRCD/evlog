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
    // Error already handled by useTestRunner
  }
}
</script>

<template>
  <div>
    <UButton
      :label
      :loading="isLoading"
      :color
      :variant
      @click="handleClick"
    />

    <PlaygroundTestResult
      v-if="showResult"
      :status
      :response="result"
      :error
    />
  </div>
</template>
