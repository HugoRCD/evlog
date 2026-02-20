<script setup lang="ts">
import { Shader, Aurora } from 'shaders/vue'
import { Motion } from 'motion-v'

const prefersReducedMotion = ref(false)

const shipByTime = ref('')
const showColon = ref(true)

function updateShipByTime() {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 10)
  const h = String(now.getHours()).padStart(2, '0')
  const m = String(now.getMinutes()).padStart(2, '0')
  shipByTime.value = `${h}:${m}`
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  updateShipByTime()
  setInterval(updateShipByTime, 1_000)
  setInterval(() => {
    showColon.value = !showColon.value 
  }, 1_000)
})
</script>

<template>
  <section class="relative overflow-hidden flex flex-col">
    <!-- Top fade mask: smooth transition from dark page into gradient -->
    <div
      class="absolute inset-x-0 top-0 h-24 z-[1] pointer-events-none"
      style="background: linear-gradient(180deg, #000000 0%, transparent 100%)"
    />

    <!-- Gradient: dark → blue → white (smooth diffuse) -->
    <div
      class="absolute inset-0"
      style="background: linear-gradient(180deg, #000000 0%, #000711 6%, #001133 14%, #002266 22%, #0044CC 32%, #0055FF 42%, #0077FF 52%, #0099FF 62%, #44BBFF 72%, #88D4FF 80%, #BBE6FF 88%, #E0F3FF 94%, #FFFFFF 100%)"
    />

    <!-- Aurora shader overlay -->
    <ClientOnly>
      <div class="absolute inset-0 mix-blend-screen opacity-30">
        <div class="size-full">
          <Shader>
            <Aurora
              color-a="#0044CC"
              color-b="#0088FF"
              color-c="#66BBFF"
              :speed="2"
              :intensity="50"
              :curtain-count="3"
              :waviness="35"
              :ray-density="12"
              :height="150"
            />
          </Shader>
        </div>
      </div>
    </ClientOnly>

    <!-- CTA content — in the blue zone -->
    <div class="relative z-10 pt-24 md:pt-32 text-center max-w-2xl mx-auto px-6">
      <Motion
        :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
        :in-view="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.5 }"
        :in-view-options="{ once: true }"
      >
        <div>
          <div class="relative mb-6">
            <h2 class="section-title text-center text-shadow-lg">
              Better logging<br>by
              <ClientOnly>
                <span class="tabular-nums">{{ shipByTime }}</span>
                <template #fallback>
                  <span>tonight</span>
                </template>
              </ClientOnly>
              <span class="cta-dot">.</span>
            </h2>
          </div>
          <p class="text-base leading-relaxed text-zinc-200 mb-10">
            Wide events, structured errors, dead simple setup.<br class="hidden sm:block">
            Set up evlog in 10 minutes. Your future self will thank you.
          </p>

          <div class="flex flex-wrap items-center justify-center gap-4">
            <UButton
              to="/getting-started/installation"
              size="lg"
              class="bg-white hover:bg-zinc-100 text-black border-0"
            >
              Get Started
              <template #trailing>
                <UIcon name="i-lucide-arrow-right" class="size-4" />
              </template>
            </UButton>
            <UButton
              to="https://github.com/hugorcd/evlog"
              target="_blank"
              size="lg"
              class="bg-white/10 border border-white/40 text-white hover:bg-white/20 backdrop-blur-sm"
            >
              <template #leading>
                <UIcon name="i-simple-icons-github" class="size-4" />
              </template>
              View on GitHub
            </UButton>
          </div>
        </div>
      </Motion>
    </div>

    <!-- Inline footer — pinned to bottom of white zone -->
    <div class="relative z-10 mt-auto pt-32 md:pt-44 pb-4">
      <div class="max-w-4xl mx-auto px-6 flex items-center justify-between">
        <div class="text-xs font-mono italic tracking-tight text-zinc-500">
          &copy; {{ new Date().getFullYear() }} - Made by
          <a href="https://hrcd.fr/" target="_blank" rel="noopener noreferrer" class="hover:underline text-zinc-700">HugoRCD</a>
        </div>
        <div class="flex items-center gap-3">
          <a href="https://x.com/hugorcd" target="_blank" rel="noopener noreferrer" aria-label="X" class="text-zinc-400 hover:text-zinc-700 transition-colors">
            <UIcon name="i-simple-icons-x" class="size-4" />
          </a>
          <a href="https://github.com/hugorcd/evlog" target="_blank" rel="noopener noreferrer" aria-label="GitHub" class="text-zinc-400 hover:text-zinc-700 transition-colors">
            <UIcon name="i-simple-icons-github" class="size-4" />
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta-dot {
  animation: pulse-dot 1s steps(1) infinite;
}

@keyframes pulse-dot {
  0%, 45% { opacity: 1; }
  50%, 95% { opacity: 0; }
  100% { opacity: 1; }
}
</style>
