<script setup lang="ts">
defineOptions({
  inheritAttrs: false
})

const { headline = '' } = defineProps<{
  title?: string
  description?: string
  headline?: string
}>()

function truncate(str: string, max: number) {
  if (!str || str.length <= max) return str
  return `${str.slice(0, str.lastIndexOf(' ', max)) }…`
}
</script>

<template>
  <div class="flex flex-row size-full bg-[#09090b]">
    <!-- Left blue accent bar -->
    <div class="flex w-[5px] h-full bg-[#2853FF]" />

    <!-- Main content -->
    <div class="flex flex-col flex-1">
      <!-- Header -->
      <div class="flex flex-row justify-between items-center px-14 pt-10">
        <div class="flex flex-row items-center gap-2.5">
          <div class="flex w-[7px] h-[7px] rounded-full bg-[#2853FF]" />
          <div class="flex text-[#2853FF] text-sm tracking-[0.18em] font-semibold" style="font-family:'Geist Mono';">
            EVLOG
          </div>
        </div>
        <div class="flex text-[#27272a] text-xs tracking-widest" style="font-family:'Geist Mono';">
          evlog.dev
        </div>
      </div>

      <!-- Body: centered content -->
      <div class="flex flex-col flex-1 justify-center px-14 gap-6">
        <!-- Category headline -->
        <div v-if="headline" class="flex text-[#3f3f46] text-sm tracking-[0.25em] font-medium" style="font-family:'Geist Mono';">
          {{ headline.toUpperCase() }}
        </div>

        <!-- Giant bracket + title -->
        <div class="flex flex-row items-end gap-2">
          <div class="flex text-[#2853FF] font-thin leading-none" style="font-family:'Geist';font-size:110px;line-height:0.85;">
            [
          </div>
          <div class="flex flex-col justify-end">
            <div class="flex text-white font-bold" style="font-family:'Geist';font-size:88px;line-height:0.95;letter-spacing:-0.03em;">
              {{ title || 'evlog' }}
            </div>
          </div>
          <div class="flex text-[#2853FF] font-thin leading-none" style="font-family:'Geist';font-size:110px;line-height:0.85;">
            ]
          </div>
        </div>

        <!-- Description -->
        <div v-if="description" class="flex text-[#3f3f46] text-[22px]" style="font-family:'Geist';line-height:1.55;max-width:900px;">
          {{ truncate(description, 160) }}
        </div>
      </div>

      <!-- Footer -->
      <div class="flex flex-col px-14 pb-9 gap-3">
        <div class="flex w-full h-px bg-[#1c1c1e]" />
        <div class="flex flex-row justify-between items-center">
          <div class="flex text-[#27272a] text-[11px] tracking-[0.22em]" style="font-family:'Geist Mono';">
            WIDE EVENTS · STRUCTURED ERRORS · TYPESCRIPT
          </div>
          <div v-if="headline" class="flex text-[#1c1c1e] text-[11px] tracking-[0.15em]" style="font-family:'Geist Mono';">
            {{ headline.toUpperCase() }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
