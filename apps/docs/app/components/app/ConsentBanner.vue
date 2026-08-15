<script setup lang="ts">
import posthog from 'posthog-js'

const visible = ref(false)

onMounted(() => {
  if (!posthog.__loaded) return
  visible.value = posthog.get_explicit_consent_status() === 'pending'
})

function decide(granted: boolean) {
  if (granted) {
    posthog.opt_in_capturing()
  } else {
    posthog.opt_out_capturing()
  }
  visible.value = false
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-4 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-4 opacity-0"
  >
    <div
      v-if="visible"
      class="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-xs z-50 rounded-lg border border-muted bg-default/95 p-4 shadow-lg backdrop-blur"
    >
      <p class="font-mono text-[10px] uppercase tracking-widest text-dimmed">
        Cookies
      </p>
      <p class="mt-1.5 text-xs/5 text-muted font-sans">
        This site stores nothing on your device. Allow cookies and we also get
        anonymous session replays, which show where the docs lose people.
      </p>
      <div class="mt-3 flex items-center gap-3">
        <UButton
          size="xs"
          label="Allow replays"
          class="text-white"
          @click="decide(true)"
        />
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          label="No cookies"
          @click="decide(false)"
        />
      </div>
    </div>
  </Transition>
</template>
