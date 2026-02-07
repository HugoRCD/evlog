<script setup lang="ts">
const props = defineProps<{
  status: 'idle' | 'loading' | 'success' | 'error'
}>()

const config = computed(() => {
  switch (props.status) {
    case 'loading':
      return {
        icon: 'i-lucide-loader-circle',
        color: 'text-blue-500',
        animate: 'animate-spin',
      }
    case 'success':
      return {
        icon: 'i-lucide-check-circle',
        color: 'text-green-500',
      }
    case 'error':
      return {
        icon: 'i-lucide-x-circle',
        color: 'text-red-500',
      }
    default:
      return {
        icon: 'i-lucide-circle',
        color: 'text-gray-400',
      }
  }
})
</script>

<template>
  <UIcon
    :name="config.icon"
    :class="[config.color, config.animate]"
    class="size-4"
  />
</template>
