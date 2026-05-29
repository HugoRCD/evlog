<script setup lang="ts">
const copied = ref(false)

async function copyCommand() {
  await navigator.clipboard.writeText('npx skills add https://www.evlog.dev')
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <section class="relative overflow-hidden bg-default">
    <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-3xl pointer-events-none" />
    <div class="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto pt-28 lg:pt-32 pb-4 px-6">
      <button
        type="button"
        class="mb-1 flex items-center gap-2 font-pixel text-xs px-4 py-1.5 rounded-full border border-muted backdrop-blur-sm transition-all hover:border-primary/50 cursor-copy"
        :class="copied ? 'text-emerald-400' : 'text-muted hover:text-highlighted'"
        :aria-label="copied ? 'Command copied' : 'Copy install command'"
        @click="copyCommand"
      >
        <span v-if="copied">Copied!</span>
        <span v-else class="flex items-center gap-2">
          <span class="text-primary">$</span>
          npx skills add https://www.evlog.dev
        </span>
      </button>

      <div class="relative">
        <h1 class="section-title mb-5 leading-[1.1]">
          <slot name="title" mdc-unwrap="p" /><span class="text-primary">.</span>
        </h1>
        <div aria-hidden="true" class="absolute inset-0 section-title mb-5 leading-[1.1] blur-xs animate-pulse pointer-events-none">
          <slot name="title" mdc-unwrap="p" /><span class="text-primary">.</span>
        </div>
      </div>

      <p class="mb-8 max-w-xl text-base/7 text-muted font-sans">
        <slot name="description" mdc-unwrap="p" />
      </p>

      <div class="flex flex-wrap justify-center items-center gap-4">
        <UButton
          to="/start/installation"
          size="lg"
          class="bg-primary hover:bg-blue-600 text-white font-medium"
          trailing-icon="i-lucide-arrow-right"
          label="Fix your logs"
        />
        <UButton
          to="https://github.com/hugorcd/evlog"
          target="_blank"
          size="lg"
          variant="ghost"
          class="text-muted hover:text-white"
          label="GitHub"
          leading-icon="i-simple-icons-github"
        />
      </div>
    </div>

    <div class="relative z-10 mt-16 pb-24">
      <HeroTerminalDemo />
    </div>
  </section>
</template>
