<script setup lang="ts">
/**
 * Environments are ordinal — development, preview, production is a progression
 * toward the thing that matters — so they get one hue stepped by proximity to
 * production rather than four unrelated colours. It also drops the donut: a
 * three-slice ring costs 140px to say what a 6px bar says better, and reading
 * angles is harder than reading lengths.
 */
const props = defineProps<{
  environments: EnvironmentCount[]
}>()

const total = computed(() => props.environments.reduce((sum, e) => sum + e.count, 0))

/** Strongest for production, fading back through the pre-production stages. */
const STEP_BY_ENVIRONMENT: Record<string, string> = {
  production: 'var(--chart-series-1)',
  preview: 'var(--chart-series-2)',
  development: 'var(--chart-series-3)',
  ci: 'var(--chart-series-4)',
}

function colorFor(environment: string) {
  return STEP_BY_ENVIRONMENT[environment] ?? 'var(--chart-series-6)'
}

/** Acronyms that read wrong under plain casing (e.g. "ci" -> "Ci"). */
const LABEL_OVERRIDES: Record<string, string> = { ci: 'CI' }

function labelFor(environment: string) {
  return LABEL_OVERRIDES[environment] ?? environment
}

function shareOf(count: number) {
  return total.value > 0 ? Math.round((count / total.value) * 100) : 0
}

const RANKED = Object.keys(STEP_BY_ENVIRONMENT)

/** Production first, then the rest of the ramp, then anything custom by volume. */
const ordered = computed(() => [...props.environments].sort((a, b) => {
  const rank = (name: string) => {
    const index = RANKED.indexOf(name)
    return index === -1 ? Number.POSITIVE_INFINITY : index
  }
  const difference = rank(a.environment) - rank(b.environment)
  return Number.isNaN(difference) || difference === 0 ? b.count - a.count : difference
}))
</script>

<template>
  <PanelCard title="Environments" subtitle="The stage each run reported itself as">
    <EmptyState
      v-if="total === 0"
      message="No runs in this range."
      hint="Widen the time range, or clear a filter."
    />

    <template v-else>
      <div class="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-[2px]">
        <div
          v-for="env in ordered"
          :key="env.environment"
          class="breakdown-bar h-full rounded-[2px]"
          :style="{ width: `${(env.count / total) * 100}%`, backgroundColor: colorFor(env.environment) }"
        />
      </div>

      <div class="mt-3 flex flex-col gap-1.5">
        <div
          v-for="env in ordered"
          :key="env.environment"
          class="flex items-center justify-between gap-3 text-[13px]"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: colorFor(env.environment) }" />
            <span class="truncate text-toned">{{ labelFor(env.environment) }}</span>
          </span>
          <span class="shrink-0 text-[11px] text-dimmed tabular-nums">
            {{ env.count.toLocaleString() }} · {{ shareOf(env.count) }}%
          </span>
        </div>
      </div>
    </template>
  </PanelCard>
</template>
