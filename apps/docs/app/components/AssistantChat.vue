<script setup lang="ts">
const appConfig = useAppConfig()
const { toggle } = useAssistant()
const { t } = useDocusI18n()

const tooltipText = computed(() => t('assistant.tooltip'))
const triggerIcon = computed(() => appConfig.assistant?.icons?.trigger || 'i-custom-ai')
</script>

<template>
  <UTooltip :text="tooltipText">
    <UButton
      :icon="triggerIcon"
      color="neutral"
      variant="ghost"
      :aria-label="tooltipText"
      @click="toggle"
    />
  </UTooltip>
</template>
