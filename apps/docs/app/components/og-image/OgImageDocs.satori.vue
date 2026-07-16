<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  inheritAttrs: false,
})

const brand = '#2853ff'
const brandGlow =
  '0 0 10px rgba(40, 83, 255, 0.38), 0 0 22px rgba(40, 83, 255, 0.16)'

const props = defineProps<{
  title?: string
  description?: string
  headline?: string
}>()

const titleText = computed(() => props.title || 'Documentation')
const titleLen = computed(() => titleText.value.length)

const pixelTitleSize = computed(() => {
  const n = titleLen.value
  if (n <= 14) return '102px'
  if (n <= 20) return '92px'
  if (n <= 28) return '82px'
  if (n <= 36) return '72px'
  if (n <= 46) return '62px'
  if (n <= 58) return '52px'
  return ''
})

const usePixelTitle = computed(() => pixelTitleSize.value !== '')

const titleShadowSoft =
  '0 0 6px rgba(255,255,255,0.2), 0 0 18px rgba(255,255,255,0.1), 0 0 40px rgba(255,255,255,0.04)'
const titleShadowWrapped =
  '0 0 10px rgba(255,255,255,0.28), 0 0 28px rgba(255,255,255,0.12), 0 0 56px rgba(255,255,255,0.05)'

const titleStyle = computed(() => {
  const textShadow = titleLen.value <= 32 ? titleShadowSoft : titleShadowWrapped

  if (usePixelTitle.value) {
    return {
      fontFamily: 'Geist Pixel Line',
      fontWeight: 500,
      fontSize: pixelTitleSize.value,
      lineHeight: 1.06,
      letterSpacing: '-0.02em',
      color: '#fafafa',
      textShadow,
    }
  }
  const n = titleLen.value
  return {
    fontFamily: 'Geist',
    fontWeight: 700,
    fontSize: n > 56 ? '56px' : n > 42 ? '68px' : n > 30 ? '78px' : '88px',
    lineHeight: 1.08,
    letterSpacing: '-0.03em',
    color: '#fafafa',
    textShadow,
  }
})

const periodStyle = computed(() => {
  const key = usePixelTitle.value ? pixelTitleSize.value : titleStyle.value.fontSize
  const px = Number.parseInt(String(key).replace('px', ''), 10) || 72
  const periodPx = Math.max(28, Math.round(px * 0.4))
  const padB = usePixelTitle.value ? Math.round(px * 0.1) : Math.round(px * 0.07)
  return {
    fontFamily: 'Geist',
    fontWeight: 700,
    fontSize: `${periodPx}px`,
    lineHeight: 1,
    color: brand,
    textShadow: brandGlow,
    paddingLeft: '6px',
    paddingBottom: `${padB}px`,
    position: 'relative' as const,
  }
})

const wordmarkGlow = {
  textShadow:
    '0 0 10px rgba(255,255,255,0.32), 0 0 26px rgba(255,255,255,0.12)',
}

const mainColumnStyle = {
  backgroundColor: '#09090b',
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
}

function truncate(str: string, max: number) {
  if (!str || str.length <= max) return str
  return `${str.slice(0, str.lastIndexOf(' ', max))}…`
}
</script>

<template>
  <div
    class="flex flex-row size-full overflow-hidden"
    :style="{ backgroundColor: '#09090b' }"
  >
    <div
      class="flex shrink-0 h-full"
      :style="{
        width: '6px',
        backgroundColor: brand,
        boxShadow: '4px 0 20px rgba(40, 83, 255, 0.28)',
      }"
    />

    <div class="flex flex-col flex-1 min-w-0 min-h-0" :style="mainColumnStyle">
      <div
        aria-hidden="true"
        class="flex font-pixel overflow-hidden font-medium"
        style="width: 0; height: 0; font-size: 1px;"
      >
        og
      </div>
      <div class="flex flex-row justify-between items-center px-14 pt-12 pb-3">
        <div class="flex flex-row items-end gap-2">
          <div
            class="flex lowercase font-pixel font-medium text-[40px] leading-none tracking-tight text-[#f5f5f5]"
            :style="wordmarkGlow"
          >
            evlog
          </div>
          <div
            class="flex shrink-0"
            :style="{
              width: '7px',
              height: '7px',
              marginBottom: '5px',
              backgroundColor: brand,
              boxShadow: brandGlow,
            }"
          />
        </div>
        <div
          class="flex text-[15px] tracking-[0.16em] font-semibold uppercase"
          :style="{ fontFamily: 'Geist Mono', color: '#9ea0a8' }"
        >
          evlog.dev
        </div>
      </div>

      <div class="flex flex-col flex-1 justify-center px-14 gap-8 min-h-0 pb-8">
        <div
          v-if="headline"
          class="flex text-[16px] tracking-[0.24em] font-semibold uppercase"
          :style="{ fontFamily: 'Geist Mono', color: '#9598a1' }"
        >
          {{ headline.toUpperCase() }}
        </div>

        <div class="flex flex-row flex-wrap items-end gap-0 max-w-[1080px]">
          <div
            class="flex max-w-[1000px]"
            :class="{ 'font-pixel': usePixelTitle }"
            :style="titleStyle"
          >
            {{ titleText }}
          </div>
          <div class="flex shrink-0" :style="periodStyle">
            .
          </div>
        </div>

        <div
          v-if="description"
          class="flex max-w-[640px] text-[28px] font-normal"
          :style="{
            fontFamily: 'Geist',
            lineHeight: 1.55,
            color: '#babdc6',
          }"
        >
          {{ truncate(description, 140) }}
        </div>
      </div>

      <div class="flex flex-col px-14 pb-11 pt-2 gap-3 shrink-0">
        <div class="flex w-full h-px" style="background-color: rgba(255,255,255,0.10)" />
        <div class="flex flex-row justify-between items-center gap-8">
          <div
            class="flex text-[13px] tracking-[0.18em] font-semibold uppercase"
            :style="{ fontFamily: 'Geist Mono', color: '#787c85' }"
          >
            WIDE EVENTS · STRUCTURED ERRORS · TYPESCRIPT
          </div>
          <div
            v-if="headline"
            class="flex text-[13px] tracking-[0.16em] font-semibold uppercase shrink-0"
            :style="{ fontFamily: 'Geist Mono', color: '#787c85' }"
          >
            {{ headline.toUpperCase() }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
