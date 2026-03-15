<script setup lang="ts">
import { Motion } from 'motion-v'

const props = defineProps<{
  link?: string
  linkLabel?: string
}>()

const prefersReducedMotion = ref(false)

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
})

// eslint-disable-next-line @typescript-eslint/naming-convention
const NuxtLink = resolveComponent('NuxtLink')
const activeTab = ref(0)

const frameworkRows = [
  [
    { name: 'Nuxt', icon: 'i-simple-icons-nuxtdotjs', tab: 0 },
    { name: 'Next.js', icon: 'i-simple-icons-nextdotjs', tab: 1 },
    { name: 'SvelteKit', icon: 'i-simple-icons-svelte', tab: 2 },
    { name: 'Nitro', icon: 'i-custom-nitro', tab: 3 },
    { name: 'TanStack Start', icon: 'i-custom-tanstack', tab: 4 },
    { name: 'NestJS', icon: 'i-simple-icons-nestjs', tab: 5 },
  ],
  [
    { name: 'Express', icon: 'i-simple-icons-express', tab: 6 },
    { name: 'Hono', icon: 'i-simple-icons-hono', tab: 7 },
    { name: 'Fastify', icon: 'i-simple-icons-fastify', tab: 8 },
    { name: 'Elysia', icon: 'i-custom-elysia', tab: 9 },
    { name: 'Cloudflare', icon: 'i-simple-icons-cloudflare', tab: 10 },
    { name: 'Bun', icon: 'i-simple-icons-bun', tab: 11 },
    { name: 'Vite', icon: 'i-custom-vite', link: '/core-concepts/vite-plugin' },
  ],
]
</script>

<template>
  <section class="py-24 md:py-32">
    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :while-in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5 }"
      :in-view-options="{ once: true }"
      class="mb-10 text-center"
    >
      <div>
        <p v-if="$slots.headline" class="section-label justify-center">
          <slot name="headline" mdc-unwrap="p" />
        </p>
        <div class="relative">
          <h2 class="section-title">
            <slot name="title" mdc-unwrap="p" /><span class="text-primary">.</span>
          </h2>
          <div aria-hidden="true" class="absolute inset-0 section-title blur-xs animate-pulse pointer-events-none">
            <slot name="title" mdc-unwrap="p" /><span class="text-primary">.</span>
          </div>
        </div>
        <p v-if="$slots.description" class="mt-4 text-sm text-zinc-400 max-w-md mx-auto">
          <slot name="description" mdc-unwrap="p" />
        </p>
        <NuxtLink v-if="props.link" :to="props.link" class="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-accent-blue transition-colors">
          {{ props.linkLabel || 'Learn more' }}
          <UIcon name="i-lucide-arrow-right" class="size-3" />
        </NuxtLink>
      </div>
    </Motion>

    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 16 }"
      :while-in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.4, delay: 0.1 }"
      :in-view-options="{ once: true }"
      class="mb-8 flex flex-col items-center gap-1 mx-auto"
    >
      <div
        v-for="(row, rowIndex) in frameworkRows"
        :key="rowIndex"
        class="flex flex-wrap items-end justify-center gap-2 md:gap-3"
      >
        <component
          :is="fw.link ? NuxtLink : 'button'"
          v-for="fw in row"
          :key="fw.name"
          :to="fw.link"
          class="group flex flex-col items-center gap-2 px-4 py-3 border outline-none transition-all duration-300"
          :class="fw.tab !== undefined && activeTab === fw.tab
            ? 'border-accent-blue/30 bg-accent-blue/5'
            : 'border-transparent hover:border-zinc-800'"
          @click="fw.tab !== undefined ? activeTab = fw.tab : undefined"
        >
          <UIcon
            :name="fw.icon"
            class="size-8 sm:size-10 transition-colors duration-300"
            :class="fw.tab !== undefined && activeTab === fw.tab ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-300'"
          />
          <span
            class="font-mono text-xs whitespace-nowrap transition-colors duration-300"
            :class="fw.tab !== undefined && activeTab === fw.tab ? 'text-zinc-300' : 'text-zinc-500 group-hover:text-zinc-300'"
          >
            {{ fw.name }}
          </span>
        </component>
      </div>
    </Motion>

    <Motion
      :initial="prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }"
      :while-in-view="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.5, delay: 0.2 }"
      :in-view-options="{ once: true }"
      class="mx-auto max-w-3xl"
    >
      <div v-show="activeTab === 0" class="landing-code">
        <slot name="nuxt" />
      </div>
      <div v-show="activeTab === 1" class="landing-code">
        <slot name="nextjs" />
      </div>
      <div v-show="activeTab === 2" class="landing-code">
        <slot name="sveltekit" />
      </div>
      <div v-show="activeTab === 3" class="landing-code">
        <slot name="nitro" />
      </div>
      <div v-show="activeTab === 4" class="landing-code">
        <slot name="tanstack-start" />
      </div>
      <div v-show="activeTab === 5" class="landing-code">
        <slot name="nestjs" />
      </div>
      <div v-show="activeTab === 6" class="landing-code">
        <slot name="express" />
      </div>
      <div v-show="activeTab === 7" class="landing-code">
        <slot name="hono" />
      </div>
      <div v-show="activeTab === 8" class="landing-code">
        <slot name="fastify" />
      </div>
      <div v-show="activeTab === 9" class="landing-code">
        <slot name="elysia" />
      </div>
      <div v-show="activeTab === 10" class="landing-code">
        <slot name="cloudflare" />
      </div>
      <div v-show="activeTab === 11" class="landing-code">
        <slot name="bun" />
      </div>
    </Motion>
  </section>
</template>
