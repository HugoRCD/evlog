<script setup lang="ts">
/** A label/value pair in the run detail grid — one definition of the pairing. */
withDefaults(defineProps<{
  label: string
  /** Set for machine-generated values (ids, versions, arch) that read better monospaced. */
  mono?: boolean
}>(), {
  mono: false,
})
</script>

<template>
  <div class="min-w-0">
    <dt class="text-[11px] text-dimmed">
      {{ label }}
    </dt>
    <dd class="mt-0.5 truncate text-[13px] text-toned" :class="mono ? 'font-mono text-xs' : ''">
      <slot />
    </dd>
  </div>
</template>
