<script setup lang="ts">
const props = defineProps<{
  environments: EnvironmentCount[]
}>()

const total = computed(() => props.environments.reduce((sum, e) => sum + e.count, 0))

/** `--chart-env-*` tokens (`main.css`) — full-saturation on light cards,
 * darkened off Nuxt UI's raw semantic tokens in dark mode so the ring reads
 * as a deliberate, muted palette rather than a "hyper brut" set of saturated
 * primaries against the dashboard's near-black background. */
const colorByEnvironment: Record<string, string> = {
  production: 'var(--chart-env-production)',
  preview: 'var(--chart-env-preview)',
  development: 'var(--chart-env-development)',
}

function colorFor(environment: string) {
  return colorByEnvironment[environment] ?? 'var(--chart-env-neutral)'
}

function shareOf(count: number) {
  return total.value > 0 ? Math.round((count / total.value) * 100) : 0
}

/** Acronyms that read wrong under CSS `capitalize` (e.g. "ci" -> "Ci"). */
const LABEL_OVERRIDES: Record<string, string> = { ci: 'CI' }

function labelFor(environment: string) {
  return LABEL_OVERRIDES[environment] ?? environment
}

/** `DonutChart` data is a plain `number[]` — order must match `categories` below. */
const data = computed(() => props.environments.map(e => e.count))

const categories = computed<Record<string, BulletLegendItemInterface>>(() =>
  Object.fromEntries(props.environments.map(e => [
    e.environment,
    { name: e.environment, color: colorFor(e.environment) },
  ])),
)
</script>

<template>
  <UCard :ui="{ header: 'py-4 px-4', body: 'p-4' }">
    <template #header>
      <h3 class="flex items-center gap-2 text-lg font-normal text-highlighted">
        <GlassIconTile icon="i-nucleo-rocket" />
        Environments
      </h3>
    </template>

    <div v-if="environments.length === 0" class="py-6 text-center text-sm text-muted">
      No data yet for this range.
    </div>

    <div v-else class="flex items-center gap-6">
      <div class="h-[140px] w-[140px] shrink-0">
        <DonutChart
          :data
          :height="140"
          :radius="4"
          :arc-width="18"
          :pad-angle="0.02"
          :categories
          hide-legend
        >
          <template #tooltip="{ values }">
            <div class="max-w-xs rounded-sm border border-default bg-elevated px-2 py-1 shadow-lg ring ring-default ring-offset-2 ring-offset-bg">
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-muted">{{ labelFor(values?.label) }}</span>
                <span class="text-sm font-semibold text-highlighted">{{ values?.[values?.label] }} · {{ shareOf(values?.[values?.label] ?? 0) }}%</span>
              </div>
            </div>
          </template>
          <div class="flex flex-col items-center">
            <span class="text-lg font-semibold text-highlighted">{{ total.toLocaleString() }}</span>
            <span class="text-[10px] text-muted">runs</span>
          </div>
        </DonutChart>
      </div>

      <div class="flex flex-1 flex-col gap-2">
        <div v-for="env in environments" :key="env.environment" class="flex items-center justify-between gap-2 text-sm">
          <span class="flex min-w-0 items-center gap-2 truncate font-medium">
            <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: colorFor(env.environment) }" />
            <span class="truncate">{{ labelFor(env.environment) }}</span>
          </span>
          <span class="shrink-0 text-muted">{{ env.count }} · {{ shareOf(env.count) }}%</span>
        </div>
      </div>
    </div>
  </UCard>
</template>
